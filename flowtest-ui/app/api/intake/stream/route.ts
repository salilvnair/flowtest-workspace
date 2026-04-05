import type { StartIntakePayload } from "@/lib/types";
import { runIntakePromptChain } from "@/lib/intake-orchestrator";
import { exec as execCb, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execCb);
const ENGINE_BASE_URL = process.env.FLOWTEST_ENGINE_BASE_URL ?? "http://localhost:8080";
const ALLURE_PORT = Number(process.env.FLOWTEST_ALLURE_PORT ?? "5057");
const ALLURE_READY_TIMEOUT_MS = Number(process.env.FLOWTEST_ALLURE_READY_TIMEOUT_MS ?? "120000");
const DEFAULT_ALLURE_RESULTS_DIR = path.resolve(process.cwd(), "../flowtest-parent/allure-results");
const DEFAULT_ALLURE_REPORT_DIR = path.resolve(process.cwd(), "../flowtest-parent/allure-report");
const OPENAPI_CACHE_DIR = path.resolve(process.cwd(), ".flowtest-cache");
const OPENAPI_CACHE_FILE = path.resolve(OPENAPI_CACHE_DIR, "openapi-latest.json");

function getProvider(): "openai" | "lmstudio" {
  const provider = String(process.env.FLOWTEST_LLM_PROVIDER ?? "openai").toLowerCase();
  return provider === "lmstudio" ? "lmstudio" : "openai";
}

function getModel(provider: "openai" | "lmstudio"): string {
  if (provider === "lmstudio") return String(process.env.LMSTUDIO_MODEL ?? "local-model");
  return String(process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
}

function resolveScenarioMode(raw: unknown): "quick" | "extensive" {
  const input = String(raw ?? "").trim().toLowerCase();
  const env = String(process.env.FLOWTEST_SCENARIO_MODE ?? "").trim().toLowerCase();
  const v = input || env;
  return v === "extensive" ? "extensive" : "quick";
}

function normalizeEventPayload(input: any): any {
  const stage = String(input?.stage ?? "");
  const status = String(input?.status ?? "");
  const title = String(input?.title ?? "");
  const detail = String(input?.detail ?? "");
  const baseMeta = { stage, status, title };
  if (detail) (baseMeta as any).detail = detail;
  return {
    ...input,
    stage,
    status,
    title,
    detail: input?.detail,
    meta: { ...baseMeta, ...(input?.meta || {}) }
  };
}

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

async function waitForAllureReady(url: string, timeoutMs: number): Promise<{ ready: boolean; elapsedMs: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (res.ok) return { ready: true, elapsedMs: Date.now() - start };
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ready: false, elapsedMs: Date.now() - start };
}

async function startAllureServer(reportDir: string, port: number): Promise<{ started: boolean; error?: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn("allure", ["open", reportDir, "-p", String(port), "--host", "127.0.0.1"], {
      detached: true,
      stdio: "ignore"
    });
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

async function resetAllureArtifactsBeforeRun() {
  const resultsDir = String(process.env.FLOWTEST_ALLURE_RESULTS_DIR_ABS || DEFAULT_ALLURE_RESULTS_DIR);
  const reportDir = String(process.env.FLOWTEST_ALLURE_REPORT_DIR_ABS || DEFAULT_ALLURE_REPORT_DIR);
  try {
    try {
      await exec(`pkill -f "allure open"`);
    } catch {}
    await rm(resultsDir, { recursive: true, force: true });
    await rm(reportDir, { recursive: true, force: true });
    await mkdir(resultsDir, { recursive: true });
    await mkdir(reportDir, { recursive: true });
    return { resultsDir, reportDir, cleaned: true, error: null as string | null };
  } catch (error: any) {
    return { resultsDir, reportDir, cleaned: false, error: String(error?.message || error || "unknown") };
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

function hhmmss(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function toErrorMeta(error: any, extra?: Record<string, unknown>): Record<string, unknown> {
  const message = String(error?.message || error || "unknown error");
  const name = String(error?.name || "Error");
  const cause = String((error as any)?.cause?.message || (error as any)?.cause || "").trim();
  const stack = String(error?.stack || "").trim();
  return {
    error_name: name,
    error_message: message,
    error_cause: cause || "-",
    error_stack: stack ? stack.slice(0, 3000) : "-",
    ...(extra || {})
  };
}

export async function POST(req: Request) {
  let payload: StartIntakePayload | null = null;
  try {
    payload = (await req.json()) as StartIntakePayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const sendEvent = (payload: any) =>
        send({ type: "event", payload: { time: hhmmss(new Date()), ...normalizeEventPayload(payload) } });
      const sendSummary = (status: string, detail: string) => send({ type: "summary", payload: { status, detail } });
      const sendMeta = (payload: any) => send({ type: "meta", payload });

      (async () => {
        try {
          const successCount = Array.isArray(payload?.successSamples) ? payload!.successSamples.length : 0;
          const failureCount = Array.isArray(payload?.failureSamples) ? payload!.failureSamples.length : 0;
          const runName = String(payload?.runName || "flowtest-run");
          const outputPath = String(payload?.outputPath || "").trim() || "-";
          const mode = payload?.multiUpload ? "multi upload" : "row mode";
          const scenarioMode = resolveScenarioMode((payload as any)?.scenarioMode);
          const orchestrationId = crypto.randomUUID();
          const temporalBase = "http://localhost:8233/namespaces/default/workflows";
          const provider = getProvider();
          const model = getModel(provider);
          const llmEndpoint = provider === "lmstudio"
            ? String(process.env.LMSTUDIO_CHAT_URL ?? "http://localhost:1234/v1/chat/completions")
            : String(process.env.OPENAI_CHAT_URL ?? "https://api.openai.com/v1/chat/completions");

          send({
            type: "init",
            payload: {
              runName,
              orchestrationId,
              temporalLink: temporalBase,
              successCount,
              failureCount,
              intakeMode: mode,
              scenarioMode,
              allowFake: false
            }
          });
          sendSummary("Running", "Executing FlowTest chain...");
          sendEvent({ stage: "RUN", status: "running", title: "Started", meta: { run_name: runName, orchestration_id: orchestrationId, intake_mode: mode, scenario_mode: scenarioMode } });
          sendEvent({ stage: "UI", status: "info", title: "Status Panel Initialized", meta: { renderer: "nextjs-webview", theme: "vscode-ported", follow_logs_default: true } });
          sendEvent({
            stage: "Intake",
            status: "running",
            title: "Received",
            meta: {
              run_name: runName,
              output_path: outputPath,
              intake_mode: mode,
              scenario_mode: scenarioMode,
              success_samples: successCount,
              failure_samples: failureCount
            }
          });
          const docs = [
            ...(Array.isArray(payload?.successSamples) ? payload.successSamples : []),
            ...(Array.isArray(payload?.failureSamples) ? payload.failureSamples : []),
            ...(payload?.aid ? [payload.aid] : []),
            ...(payload?.hld ? [payload.hld] : [])
          ];
          for (let i = 0; i < docs.length; i++) {
            const doc = docs[i] as any;
            const fileName = String((doc as any)?.fileName || (doc as any)?.title || "untitled");
            const content = String(doc?.content || "");
            sendEvent({
              stage: "Intake",
              status: "info",
              title: "Doc Loaded",
              detail: fileName,
              meta: {
                doc_index: i + 1,
                doc_total: docs.length,
                doc_id: String(doc?.id || "-"),
                doc_type: String(doc?.type || "DOC"),
                file_name: fileName,
                file_path: fileName,
                file_size_chars: content.length,
                file_size_bytes_utf8: Buffer.byteLength(content, "utf8")
              }
            });
          }
          sendEvent({ stage: "Intake", status: "info", title: "Normalized", meta: { docs_total: docs.length, normalized_docs: docs.length } });
          sendSummary("Running", "Generating API Spec...");
          sendEvent({ stage: "UI", status: "info", title: "Progress", detail: "Generating API spec...", meta: { next_stage: "API Spec", provider, model } });
          sendEvent({
            stage: "API Spec",
            status: "running",
            title: "Started",
            meta: { provider, model, llm_endpoint: llmEndpoint, task: "GENERATE_API_SPEC" }
          });

          const chain = await runIntakePromptChain(payload!, async (ev) => {
            sendEvent(ev);
            if (ev.stage === "API Spec" && ev.title === "Ai Response Received") {
              sendEvent({ stage: "UI", status: "info", title: "Api Spec Section Rendered" });
              sendEvent({ stage: "API Spec", status: "success", title: "Completed" });
              sendSummary("Running", "Generating WireMock...");
              sendEvent({ stage: "UI", status: "info", title: "Progress", detail: "Generating WireMock definitions...", meta: { next_stage: "WireMock", provider, model } });
              sendEvent({ stage: "WireMock", status: "running", title: "Started", meta: { provider, model, llm_endpoint: llmEndpoint, task: "GENERATE_MOCKS" } });
            } else if (ev.stage === "WireMock" && ev.title === "Ai Response Received") {
              sendEvent({ stage: "UI", status: "info", title: "Wiremock Section Rendered" });
              sendEvent({ stage: "WireMock", status: "success", title: "Completed" });
              sendSummary("Running", "Generating Scenario DSL...");
              sendEvent({ stage: "UI", status: "info", title: "Progress", detail: "Generating FlowTest scenario DSL...", meta: { next_stage: "Scenario DSL", provider, model } });
              sendEvent({ stage: "Scenario DSL", status: "running", title: "Started", meta: { provider, model, llm_endpoint: llmEndpoint, task: "GENERATE_SCENARIO" } });
            } else if (ev.stage === "Scenario DSL" && ev.title === "Ai Response Received") {
              sendEvent({ stage: "UI", status: "info", title: "Scenario Section Rendered" });
              sendEvent({ stage: "Scenario DSL", status: "success", title: "Completed" });
            }
          });

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
          const scenarioList = Array.isArray(chain.parsed.scenariosJson) && chain.parsed.scenariosJson.length > 0
            ? chain.parsed.scenariosJson
            : (chain.parsed.scenarioJson ? [chain.parsed.scenarioJson] : []);
          const canRunEngine = scenarioList.length > 0 && !preflightError && !!chain.parsed.mockCoverageOk;

          sendEvent({
            stage: "Scenario DSL",
            status: chain.parsed.scenarioJson ? "success" : "error",
            title: chain.parsed.scenarioJson ? "Json Parse Ok" : "Json Parse Failed",
            meta: { scenario_json_ok: !!chain.parsed.scenarioJson, scenario_count: scenarioList.length, preflight_error: preflightError || "-", attached_mocks: Number(chain.parsed.attachedMockCount ?? 0) }
          });
          sendEvent({
            stage: "Scenario DSL",
            status: chain.parsed.scenarioJson ? "success" : "error",
            title: "Engine Shape Validated",
            meta: { can_run_engine: canRunEngine, mock_coverage_ok: !!chain.parsed.mockCoverageOk, wiremock_mock_count: Number(chain.parsed.wiremockMockCount ?? 0) }
          });
          sendSummary("Running", "Running Engine...");
          sendEvent({ stage: "UI", status: "info", title: "Progress", detail: "Running FlowTest engine validation...", meta: { next_stage: "Engine Run" } });
          sendEvent({
            stage: "Engine Run",
            status: "running",
            title: "Started",
            meta: {
              engine_url: `${ENGINE_BASE_URL}/api/scenarios/run-temporal`,
              method: "POST",
              can_run_engine: canRunEngine,
              scenario_count: scenarioList.length
            }
          });

          if (!canRunEngine) {
            engine = { ok: false, skipped: true, reason: preflightError || "Scenario preflight failed before engine run", status: 0, body: "" };
            allure = { ok: false, skipped: true, error: "Allure skipped because engine run was not started" };
            sendEvent({ stage: "Engine Run", status: "error", title: "Preflight Failed", detail: engine.reason });
          } else {
            const preClean = await resetAllureArtifactsBeforeRun();
            const engineRuns: Array<any> = [];
            let meta: ReturnType<typeof extractAllureMetaFromEngineBody> = {};
            for (let idx = 0; idx < scenarioList.length; idx++) {
              const scenarioItem = scenarioList[idx];
              const scenarioId = String((scenarioItem as any)?.scenarioId || `scenario-${idx + 1}`);
              sendEvent({
                stage: "Engine Run",
                status: "running",
                title: "Scenario Dispatch",
                detail: `${idx + 1}/${scenarioList.length} ${scenarioId}`,
                meta: { scenario_index: idx + 1, scenario_total: scenarioList.length, scenario_id: scenarioId }
              });
              let upstream: Response;
              let body = "";
              try {
                upstream = await fetch(`${ENGINE_BASE_URL}/api/scenarios/run-temporal`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scenario: scenarioItem })
                });
                body = await upstream.text();
              } catch (fetchError: any) {
                engineRuns.push({
                  ok: false,
                  status: 0,
                  body: "",
                  workflowId: undefined,
                  runId: undefined,
                  scenarioId,
                  fetchError: String(fetchError?.message || fetchError || "fetch failed")
                });
                sendEvent({
                  stage: "Engine Run",
                  status: "error",
                  title: "Request Failed",
                  detail: String(fetchError?.message || fetchError || "fetch failed"),
                  meta: toErrorMeta(fetchError, {
                    engine_url: `${ENGINE_BASE_URL}/api/scenarios/run-temporal`,
                    scenario_id: scenarioId,
                    scenario_index: idx + 1,
                    scenario_total: scenarioList.length
                  })
                });
                continue;
              }
              let workflowId = "";
              let runId = "";
              try {
                const parsed = JSON.parse(body);
                workflowId = String(parsed?.workflowId ?? "");
                runId = String(parsed?.runId ?? "");
              } catch {}
              meta = extractAllureMetaFromEngineBody(body);
              const runOk = upstream.ok;
              engineRuns.push({
                ok: runOk,
                status: upstream.status,
                body,
                workflowId: workflowId || undefined,
                runId: runId || undefined,
                scenarioId
              });

              if (workflowId) {
                const temporalLink = `${temporalBase}/${workflowId}${runId ? `/${runId}` : ""}`;
                send({ type: "temporal", payload: { temporalLink } });
                sendEvent({
                  stage: "Engine Run",
                  status: runOk ? "running" : "error",
                  title: "Temporal Workflow Started",
                  detail: temporalLink,
                  meta: {
                    temporal_link: temporalLink,
                    workflow_id: workflowId,
                    run_id: runId || "-",
                    scenario_id: scenarioId,
                    scenario_index: idx + 1,
                    scenario_total: scenarioList.length
                  }
                });
              }

              sendEvent({
                stage: "Engine Run",
                status: runOk ? "running" : "error",
                title: "Response Received",
                detail: `http_status=${upstream.status}`,
                meta: {
                  http_status: upstream.status,
                  workflow_id: workflowId || "-",
                  run_id: runId || "-",
                  response_chars: body.length,
                  scenario_id: scenarioId,
                  scenario_index: idx + 1,
                  scenario_total: scenarioList.length
                }
              });
            }
            const passedRuns = engineRuns.filter((r) => !!r.ok).length;
            const failedRuns = engineRuns.length - passedRuns;
            const lastRun = engineRuns[engineRuns.length - 1] || {};
            engine = {
              ok: failedRuns === 0,
              status: failedRuns === 0 ? 200 : 207,
              runs: engineRuns,
              body: String(lastRun?.body || ""),
              workflowId: lastRun?.workflowId,
              runId: lastRun?.runId,
              passedRuns,
              failedRuns,
              totalRuns: engineRuns.length
            };

            if (meta.generateCommand && meta.resultsPath && meta.reportDir) {
              sendSummary("Running", "Generating Allure Report...");
              try {
                const cmd = `allure generate "${meta.resultsPath}" -o "${meta.reportDir}" --clean`;
                await exec(cmd);
                sendEvent({ stage: "ALLURE", status: "running", title: "Server Booting", detail: "Allure is starting..." });
                try {
                  await exec(`pkill -f "allure open"`);
                } catch {}
                const safePort = Number.isFinite(ALLURE_PORT) ? Math.max(1000, ALLURE_PORT) : 5057;
                const started = await startAllureServer(meta.reportDir, safePort);
                const allureUrl = `http://127.0.0.1:${safePort}`;
                const readyState = started.started
                  ? await waitForAllureReady(allureUrl, Number.isFinite(ALLURE_READY_TIMEOUT_MS) ? Math.max(1000, ALLURE_READY_TIMEOUT_MS) : 120000)
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
                sendSummary("Running", "Allure in progress...");
                sendEvent({
                  stage: "ALLURE",
                  status: readyState.ready ? "success" : "warn",
                  title: readyState.ready ? "Server Ready" : "Server Not Reachable",
                  detail: allureUrl,
                  meta: {
                    allure_url: allureUrl,
                    report_path: meta.reportPath ?? "-",
                    report_dir: meta.reportDir ?? "-",
                    command: cmd,
                    server_started: started.started,
                    server_ready: readyState.ready,
                    ready_wait_ms: readyState.elapsedMs,
                    ready_timeout_ms: Number.isFinite(ALLURE_READY_TIMEOUT_MS) ? Math.max(1000, ALLURE_READY_TIMEOUT_MS) : 120000
                  }
                });
              } catch (error: any) {
                allure = { ok: false, command: meta.generateCommand, error: String(error?.message ?? error), reportPath: meta.reportPath ?? null, reportDir: meta.reportDir ?? null, preClean };
                sendEvent({
                  stage: "ALLURE",
                  status: "warn",
                  title: "Generate Failed",
                  detail: allure.error,
                  meta: {
                    command: String(meta.generateCommand ?? "-"),
                    report_path: String(meta.reportPath ?? "-"),
                    report_dir: String(meta.reportDir ?? "-"),
                    error_message: String(allure.error ?? "-")
                  }
                });
              }
            } else {
              allure = { ok: false, skipped: true, error: "Allure metadata missing from engine response" };
              sendEvent({
                stage: "ALLURE",
                status: "warn",
                title: "Generate Failed",
                detail: allure.error,
                meta: {
                  skipped: true,
                  error_message: String(allure.error ?? "-"),
                  wiremock_base_url: String(meta.wiremockBaseUrl ?? "-")
                }
              });
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

          const response = {
            ok: true,
            acceptedAt: new Date().toISOString(),
            summary: {
              runName,
              outputPath: payload?.outputPath || "",
              multiUpload: !!payload?.multiUpload,
              fakeRun: !!payload?.fakeRun,
              successCount,
              failureCount,
              hasAid: !!payload?.aid,
              hasHld: !!payload?.hld
            },
            payload,
            chain,
            engine,
            allure,
            docs: {
              openapiUrl,
              wiremockOpenApiUrl,
              wiremockAdminMappingsUrl
            }
          };

          sendMeta({
            outputPath,
            wiremockBaseUrl: String(chain.parsed.wiremockBaseUrl || "-"),
            allureResultsPath: String(chain.parsed.allureResultsPath || "-"),
            allureReportPath: String(chain.parsed.allureReportPath || "-"),
            scenarioMode: String(chain.parsed.scenarioMode || scenarioMode),
            wiremockOpenApiUrl: wiremockOpenApiUrl || `${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/openapi`,
            wiremockAdminMappingsUrl: wiremockAdminMappingsUrl || `${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/mappings`,
            aiGeneratedDataUrl: `${new URL(req.url).origin}/ai-generated-data`,
            apiExplorerUrl: `${new URL(req.url).origin}/api-explorer`
          });

          const finalOk = !preflightError && !!engine?.ok && !engine?.skipped;
          const totalRuns = Number(engine?.totalRuns ?? 0);
          const passedRuns = Number(engine?.passedRuns ?? 0);
          sendSummary(
            finalOk ? "Completed" : "Failed",
            finalOk
              ? `Engine scenarios: ${passedRuns}/${totalRuns || 1} passed`
              : (preflightError || `Engine scenarios: ${passedRuns}/${totalRuns || 1} passed`)
          );
          sendEvent({
            stage: "RUN",
            status: finalOk ? "success" : "error",
            title: finalOk ? "Completed" : "Failed",
            meta: {
              run_name: runName,
              orchestration_id: orchestrationId,
              engine_ok: finalOk,
              scenario_total: Number(engine?.totalRuns ?? scenarioList.length),
              scenario_passed: Number(engine?.passedRuns ?? 0),
              scenario_failed: Number(engine?.failedRuns ?? 0),
              scenario_mode: String(chain.parsed?.scenarioMode || scenarioMode),
              preflight_error: preflightError || "-",
              wiremock_base_url: String(chain.parsed.wiremockBaseUrl || "-")
            }
          });
          send({ type: "final", payload: response });
          controller.close();
        } catch (error: any) {
          const msg = String(error?.message || error || "Streaming run failed");
          sendEvent({
            stage: "RUN",
            status: "error",
            title: "Failed",
            detail: msg,
            meta: toErrorMeta(error)
          });
          sendSummary("Failed", msg);
          send({ type: "error", payload: { message: msg, meta: toErrorMeta(error) } });
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
