import { NextRequest, NextResponse } from "next/server";
import type { StartIntakePayload } from "@/lib/types";
import { runIntakePromptChain } from "@/lib/intake-orchestrator";
import { exec as execCb, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { writeFile } from "node:fs/promises";

const exec = promisify(execCb);
const ENGINE_BASE_URL = process.env.FLOWTEST_ENGINE_BASE_URL ?? "http://localhost:8080";
const ALLURE_PORT = Number(process.env.FLOWTEST_ALLURE_PORT ?? "5057");
const ALLURE_READY_TIMEOUT_MS = Number(process.env.FLOWTEST_ALLURE_READY_TIMEOUT_MS ?? "120000");
const DEFAULT_ALLURE_RESULTS_DIR = path.resolve(process.cwd(), "../flowtest-parent/allure-results");
const DEFAULT_ALLURE_REPORT_DIR = path.resolve(process.cwd(), "../flowtest-parent/allure-report");
const OPENAPI_CACHE_DIR = path.resolve(process.cwd(), ".flowtest-cache");
const OPENAPI_CACHE_FILE = path.resolve(OPENAPI_CACHE_DIR, "openapi-latest.json");

function stripJsonFences(raw: string): string {
  const text = String(raw || "").trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? String(match[1] || "").trim() : text;
}

function parseOpenApiJson(raw: string): Record<string, unknown> | null {
  const clean = stripJsonFences(raw);
  if (!clean) return null;
  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
}

async function waitForAllureReady(
  url: string,
  timeoutMs: number
): Promise<{ ready: boolean; elapsedMs: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (res.ok) return { ready: true, elapsedMs: Date.now() - start };
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ready: false, elapsedMs: Date.now() - start };
}

async function startAllureServer(reportDir: string, port: number): Promise<{ started: boolean; error?: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn(
      "allure",
      ["open", reportDir, "-p", String(port), "--host", "127.0.0.1"],
      { detached: true, stdio: "ignore" }
    );
    const finish = (value: { started: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (err) => finish({ started: false, error: String((err as any)?.message || err) }));
    setTimeout(() => {
      if (settled) return;
      try {
        child.unref();
      } catch {
        // ignore
      }
      finish({ started: true });
    }, 350);
  });
}

async function resetAllureArtifactsBeforeRun(): Promise<{
  resultsDir: string;
  reportDir: string;
  cleaned: boolean;
  error?: string;
}> {
  const resultsDir = String(process.env.FLOWTEST_ALLURE_RESULTS_DIR_ABS || DEFAULT_ALLURE_RESULTS_DIR);
  const reportDir = String(process.env.FLOWTEST_ALLURE_REPORT_DIR_ABS || DEFAULT_ALLURE_REPORT_DIR);
  try {
    try {
      await exec(`pkill -f "allure open"`);
    } catch {
      // ignore if not running
    }
    await rm(resultsDir, { recursive: true, force: true });
    await rm(reportDir, { recursive: true, force: true });
    await mkdir(resultsDir, { recursive: true });
    await mkdir(reportDir, { recursive: true });
    return { resultsDir, reportDir, cleaned: true };
  } catch (error: any) {
    return {
      resultsDir,
      reportDir,
      cleaned: false,
      error: String(error?.message || error)
    };
  }
}

function extractAllureMetaFromEngineBody(body: string): {
  resultsPath?: string;
  reportPath?: string;
  reportDir?: string;
  generateCommand?: string;
  wiremockBaseUrl?: string;
} {
  try {
    const parsed = JSON.parse(body);
    const source = parsed?.result?.allure ?? parsed?.allure ?? {};
    const wireMock = parsed?.result?.wireMock ?? parsed?.wireMock ?? {};
    const resultsPath = String(source?.resultsDirectoryAbsolute ?? "").trim();
    const reportPath = String(source?.reportIndexAbsolute ?? "").trim();
    const reportDir = String(source?.reportDirectoryAbsolute ?? "").trim();
    const generateCommand = String(source?.generateCommand ?? "").trim();
    const wiremockBaseUrl = String(wireMock?.baseUrl ?? "").trim();
    return {
      resultsPath: resultsPath || undefined,
      reportPath: reportPath || undefined,
      reportDir: reportDir || undefined,
      generateCommand: generateCommand || undefined,
      wiremockBaseUrl: wiremockBaseUrl || undefined
    };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as StartIntakePayload;

    const successCount = Array.isArray(payload.successSamples) ? payload.successSamples.length : 0;
    const failureCount = Array.isArray(payload.failureSamples) ? payload.failureSamples.length : 0;

    const summary = {
      runName: payload.runName || "flowtest-run",
      outputPath: payload.outputPath || "",
      multiUpload: !!payload.multiUpload,
      fakeRun: !!payload.fakeRun,
      successCount,
      failureCount,
      hasAid: !!payload.aid,
      hasHld: !!payload.hld
    };

    if (payload.fakeRun) {
      return NextResponse.json({
        ok: true,
        acceptedAt: new Date().toISOString(),
        summary,
        payload
      });
    }

    const chain = await runIntakePromptChain(payload);
    const openApiDoc = parseOpenApiJson(String(chain.outputs?.apiSpecText || ""));
    let openapiUrl: string | null = null;
    if (openApiDoc) {
      try {
        await mkdir(OPENAPI_CACHE_DIR, { recursive: true });
        await writeFile(OPENAPI_CACHE_FILE, JSON.stringify(openApiDoc, null, 2), "utf-8");
        openapiUrl = "/api/openapi/latest";
      } catch {
        openapiUrl = null;
      }
    }
    let engine: any = null;
    let allure: any = null;
    let wiremockOpenApiUrl: string | null = null;
    let wiremockAdminMappingsUrl: string | null = null;
    const preflightError = String(chain.parsed.preflightError ?? "").trim();
    const canRunEngine = !!chain.parsed.scenarioJson && !preflightError && !!chain.parsed.mockCoverageOk;

    if (!canRunEngine) {
      engine = {
        ok: false,
        skipped: true,
        reason: preflightError || "Scenario preflight failed before engine run",
        status: 0,
        body: ""
      };
      allure = {
        ok: false,
        skipped: true,
        error: "Allure skipped because engine run was not started"
      };
    } else if (chain.parsed.scenarioJson) {
      const preClean = await resetAllureArtifactsBeforeRun();
      const upstream = await fetch(`${ENGINE_BASE_URL}/api/scenarios/run-temporal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: chain.parsed.scenarioJson })
      });
      const body = await upstream.text();
      let workflowId = "";
      let runId = "";
      try {
        const parsed = JSON.parse(body);
        workflowId = String(parsed?.workflowId ?? "");
        runId = String(parsed?.runId ?? "");
      } catch {
        // ignore
      }
      const meta = extractAllureMetaFromEngineBody(body);
      engine = {
        ok: upstream.ok,
        status: upstream.status,
        body,
        workflowId: workflowId || undefined,
        runId: runId || undefined
      };
      if (meta.generateCommand && meta.resultsPath && meta.reportDir) {
        try {
          const cmd = `allure generate "${meta.resultsPath}" -o "${meta.reportDir}" --clean`;
          await exec(cmd);
          try {
            await exec(`pkill -f "allure open"`);
          } catch {
            // ignore (no existing allure process)
          }
          const safePort = Number.isFinite(ALLURE_PORT) ? Math.max(1000, ALLURE_PORT) : 5057;
          const started = await startAllureServer(meta.reportDir, safePort);
          const allureUrl = `http://127.0.0.1:${safePort}`;
          const readyState = started.started
            ? await waitForAllureReady(
                allureUrl,
                Number.isFinite(ALLURE_READY_TIMEOUT_MS) ? Math.max(1000, ALLURE_READY_TIMEOUT_MS) : 120000
              )
            : { ready: false, elapsedMs: 0 };
          allure = {
            ok: true,
            command: cmd,
            reportPath: meta.reportPath ?? null,
            reportDir: meta.reportDir ?? null,
            url: allureUrl,
            serverStarted: started.started,
            serverReady: readyState.ready,
            readyWaitMs: readyState.elapsedMs,
            readyTimeoutMs: Number.isFinite(ALLURE_READY_TIMEOUT_MS) ? Math.max(1000, ALLURE_READY_TIMEOUT_MS) : 120000,
            startError: started.error ?? null,
            preClean
          };
        } catch (error: any) {
          allure = {
            ok: false,
            command: meta.generateCommand,
            error: String(error?.message ?? error),
            reportPath: meta.reportPath ?? null,
            reportDir: meta.reportDir ?? null,
            preClean
          };
        }
      } else if (meta.reportPath || meta.generateCommand) {
        allure = {
          ok: false,
          command: meta.generateCommand ?? "",
          error: "Allure metadata incomplete for generation",
          reportPath: meta.reportPath ?? null,
          reportDir: meta.reportDir ?? null,
          preClean
        };
      } else {
        allure = {
          ok: false,
          skipped: true,
          error: "Allure metadata missing from engine response",
          preClean
        };
      }
      chain.parsed = {
        ...chain.parsed,
        wiremockBaseUrl: meta.wiremockBaseUrl ?? null,
        allureResultsPath: meta.resultsPath ?? null,
        allureReportPath: meta.reportPath ?? null,
        allureGenerateCommand: meta.generateCommand ?? null
      };
      if (meta.wiremockBaseUrl) {
        wiremockAdminMappingsUrl = `${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/mappings`;
        wiremockOpenApiUrl = `${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/openapi`;
      }
    }
    return NextResponse.json({
      ok: true,
      acceptedAt: new Date().toISOString(),
      summary,
      payload,
      chain,
      engine,
      allure,
      docs: {
        openapiUrl,
        wiremockOpenApiUrl,
        wiremockAdminMappingsUrl
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
