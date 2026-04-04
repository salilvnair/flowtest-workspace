import * as vscode from "vscode";
import { executeAiTask, executeAiTaskDetailed, AiExecutionDetails } from "./aiService";
import { openFormsBootstrapForm } from "./flowtest-bootstrap-form";
import { openScenarioForm } from "./flowtest-scenario-form";
import { openMocksForm } from "./flowtest-mocks-form";
import { openVisionForm } from "./flowtest-vision-form";
import { openStartIntakeForm, StartIntakePayload, IntakeDoc } from "./flowtest-start-form";
import { generateAndOpenAllureReport, setPreferredAllurePaths } from "./report-utils";
import { FlowtestStatusPanel } from "./flowtest-status-panel";
import { createFakeRunFixture } from "./faker";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

type FlowtestFollowup = vscode.ChatFollowup;

function stripLeadingFlowtestMention(s: string): string {
  let t = s.trim();
  if (t.toLowerCase().startsWith("@flowtest")) {
    t = t.slice("@flowtest".length).trim();
  }
  return t;
}

function norm(s: string): string {
  return stripLeadingFlowtestMention(s).trim().toLowerCase();
}

function resultWithFollowups(followups: FlowtestFollowup[]): vscode.ChatResult {
  return { metadata: { flowtest_followups: followups } };
}

function notifyCancelled(message = "FlowTest form cancelled."): void {
  void vscode.window.showInformationMessage(message);
}

function defaultFollowups(): FlowtestFollowup[] {
  return [
    { prompt: "start", label: "Start intake" },
    { prompt: "forms", label: "Open forms" },
    { prompt: "open_scenario_form", label: "Scenario form" },
    { prompt: "open_mocks_form", label: "Mocks form" },
    { prompt: "open_vision_form", label: "Vision form" },
    { prompt: "show report", label: "Show report" }
  ];
}

function helpText(): string {
  return [
    "### FlowTest Copilot (`@flowtest`)",
    "",
    "Use one of these:",
    "- `start`",
    "- `forms`",
    "- `open_scenario_form`",
    "- `open_mocks_form`",
    "- `open_vision_form`",
    "- `show report`",
    "",
    "After submitting a form, I generate a structured FlowTest scenario prompt via Copilot/OpenAI."
  ].join("\n");
}

function summarizeDocs(rows: IntakeDoc[]): string {
  return (rows ?? [])
    .map((r, idx) => {
      const name = (r.title || r.fileName || "untitled").trim();
      return `${idx + 1}. [${r.type}] ${name} (${r.content.length} chars)`;
    })
    .join("\n");
}

function summarizeDocsMarkdown(rows: IntakeDoc[]): string {
  return (rows ?? [])
    .map((r) => {
      const name = (r.title || r.fileName || "untitled").trim();
      return `- [${r.type}] ${name} (${r.content.length} chars)`;
    })
    .join("\n");
}

function intakeToDocs(intake: StartIntakePayload): IntakeDoc[] {
  const docs: IntakeDoc[] = [];
  docs.push(...(intake.successSamples ?? []));
  docs.push(...(intake.failureSamples ?? []));
  if (intake.aid) docs.push(intake.aid);
  if (intake.hld) docs.push(intake.hld);
  return docs;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : raw;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(raw.slice(first, last + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function extractJsonValue(text: string): unknown | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    // ignore
  }

  const firstObj = raw.indexOf("{");
  const lastObj = raw.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    try {
      return JSON.parse(raw.slice(firstObj, lastObj + 1));
    } catch {
      // ignore
    }
  }

  const firstArr = raw.indexOf("[");
  const lastArr = raw.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    try {
      return JSON.parse(raw.slice(firstArr, lastArr + 1));
    } catch {
      // ignore
    }
  }
  return null;
}

function normalizeWiremockMocks(value: unknown): Array<Record<string, unknown>> {
  const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const one = (raw: unknown): Record<string, unknown> | null => {
    const obj = asObject(raw);
    if (!obj) return null;
    const request = asObject(obj.request);
    const response = asObject(obj.response);
    if (!request || !response) return null;
    const method = String((request as any).method ?? "").trim();
    const url = String(
      (request as any).url ??
      (request as any).urlPath ??
      (request as any).urlPattern ??
      (request as any).urlPathPattern ??
      ""
    ).trim();
    if (!method || !url) return null;
    return { request, response };
  };

  const out: Array<Record<string, unknown>> = [];
  const pushAll = (arr: unknown[]) => {
    for (const item of arr) {
      const m = one(item);
      if (m) out.push(m);
    }
  };

  if (Array.isArray(value)) {
    pushAll(value);
    return out;
  }

  const obj = asObject(value);
  if (!obj) return out;

  if (Array.isArray((obj as any).mocks)) {
    pushAll((obj as any).mocks as unknown[]);
  } else if (Array.isArray((obj as any).mappings)) {
    pushAll((obj as any).mappings as unknown[]);
  } else {
    const m = one(obj);
    if (m) out.push(m);
  }
  return out;
}

function countScenarioMockCoverage(input: Record<string, unknown>): { mocks: number; inline: number } {
  const countInlineInSteps = (steps: unknown): number => {
    if (!Array.isArray(steps)) return 0;
    let n = 0;
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const req = (step as any).request;
      if (req && typeof req === "object" && (req as any)._flowtestMockResponse !== undefined) {
        n++;
      }
    }
    return n;
  };

  if (Array.isArray((input as any).scenarios)) {
    let mocks = 0;
    let inline = 0;
    for (const sc of (input as any).scenarios as Array<unknown>) {
      if (!sc || typeof sc !== "object") continue;
      const s = sc as Record<string, unknown>;
      mocks += Array.isArray((s as any).mocks) ? (s as any).mocks.length : 0;
      inline += countInlineInSteps((s as any).steps);
    }
    return { mocks, inline };
  }

  return {
    mocks: Array.isArray((input as any).mocks) ? (input as any).mocks.length : 0,
    inline: countInlineInSteps((input as any).steps)
  };
}

function toSlug(raw: string): string {
  return (raw || "generated-scenario")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generated-scenario";
}

function normalizeStepType(raw: string): string {
  const k = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  const map: Record<string, string> = {
    api_call: "api-call",
    api_assert: "api-assert",
    async_event_validation: "api-assert",
    log: "log",
    set_context: "set-context",
    sleep: "sleep"
  };
  return map[k] ?? k.replace(/_/g, "-");
}

function normalizeScenarioForEngine(input: Record<string, unknown>): {
  scenario: Record<string, unknown> | null;
  notes: string[];
  errors: string[];
} {
  const notes: string[] = [];
  const errors: string[] = [];

  const scenarioCandidate: Record<string, unknown> = input;

  const scenarioName = String(
    (scenarioCandidate as any).name ||
      (input as any).flowName ||
      "Generated Scenario"
  ).trim();
  const scenarioId = String(
    (scenarioCandidate as any).scenarioId ||
      (scenarioCandidate as any).id ||
      toSlug(scenarioName)
  ).trim();

  const rawSteps = Array.isArray((scenarioCandidate as any).steps)
    ? ((scenarioCandidate as any).steps as Array<Record<string, unknown>>)
    : [];

  if (rawSteps.length === 0) {
    errors.push("No steps found. Expected a non-empty `steps` array.");
  }

  const mappedSteps: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i] ?? {};
    const stepId = String((step as any).id || (step as any).stepId || `step_${i + 1}`).trim();
    const stepType = normalizeStepType(String((step as any).type || (step as any).stepType || ""));

    const allowedTypes = new Set(["api-call", "api-assert", "log", "set-context", "sleep"]);
    if (!allowedTypes.has(stepType)) {
      errors.push(`Step ${stepId}: unsupported type '${String((step as any).type || "")}'`);
      continue;
    }

    const mapped: Record<string, unknown> = { id: stepId, type: stepType };

    const request = (step as any).request;
    if (request && typeof request === "object") {
      const reqCopy: Record<string, unknown> = { ...(request as Record<string, unknown>) };
      const expected = (step as any).expectedResponse;
      if (expected && typeof expected === "object") {
        if ((expected as any).body !== undefined) {
          reqCopy._flowtestMockResponse = (expected as any).body;
        }
        if ((expected as any).status !== undefined) {
          reqCopy._flowtestMockStatus = (expected as any).status;
        }
      }
      mapped.request = reqCopy;
    }
    const inputObj = (step as any).input;
    if (inputObj && typeof inputObj === "object") {
      mapped.input = inputObj;
    }

    if (stepType === "api-call" || stepType === "api-assert") {
      const req = (mapped.request ?? {}) as Record<string, unknown>;
      const method = String(req.method ?? "").trim();
      const url = String(req.url ?? "").trim();
      if (!method || !url) {
        errors.push(`Step ${stepId}: api step requires request.method and request.url`);
      }
    }

    mappedSteps.push(mapped);
  }

  const scenario: Record<string, unknown> = {
    dslVersion: "1.0",
    scenarioId,
    name: scenarioName,
    steps: mappedSteps
  };

  if ((scenarioCandidate as any).config && typeof (scenarioCandidate as any).config === "object") {
    scenario.config = (scenarioCandidate as any).config;
  }

  if ((scenarioCandidate as any).data && typeof (scenarioCandidate as any).data === "object") {
    scenario.data = (scenarioCandidate as any).data;
  }

  if (Array.isArray((scenarioCandidate as any).mocks)) {
    scenario.mocks = ((scenarioCandidate as any).mocks as Array<unknown>)
      .filter((m) => !!m && typeof m === "object");
  }

  if (errors.length > 0) {
    return { scenario: null, notes, errors };
  }

  return { scenario, notes, errors };
}

function normalizeScenariosForEngine(input: Record<string, unknown>): Array<{
  scenario: Record<string, unknown> | null;
  notes: string[];
  errors: string[];
}> {
  const rawScenarios = (input as any).scenarios;
  if (Array.isArray(rawScenarios) && rawScenarios.length > 0) {
    return rawScenarios.map((s: any, idx: number) => {
      const source: Record<string, unknown> =
        s && typeof s === "object" ? (s as Record<string, unknown>) : {};
      const normalized = normalizeScenarioForEngine(source);
      if (normalized.scenario && !(source as any).name && (input as any).flowName) {
        normalized.scenario.name = `${String((input as any).flowName)} - scenario_${idx + 1}`;
      }
      normalized.notes.push(`Scenario candidate ${idx + 1}/${rawScenarios.length}`);
      return normalized;
    });
  }
  return [normalizeScenarioForEngine(input)];
}

function ts(): string {
  return new Date().toISOString();
}

function tsShort(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour12: false });
}

function prettyLabel(raw: string): string {
  return String(raw || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function prettyStage(stage: string): string {
  const map: Record<string, string> = {
    INTAKE: "Intake",
    API_SPEC: "API Spec",
    WIREMOCK: "WireMock",
    SCENARIO_DSL: "Scenario DSL",
    ENGINE_RUN: "Engine Run"
  };
  return map[stage] ?? prettyLabel(stage);
}

function verboseEvent(
  stage: string,
  event: string,
  details?: string
): string {
  const time = tsShort();
  const stageText = prettyStage(stage);
  const eventText = prettyLabel(event);
  const detailText = details ? ` — ${String(details)}` : "";
  return `- \`${time}\` **${stageText}** · ${eventText}${detailText}`;
}

function verboseStatusFromEvent(event: string): "running" | "success" | "warn" | "error" | "info" {
  const e = String(event || "").toLowerCase();
  if (e.includes("error") || e.includes("failed")) return "error";
  if (e.includes("warn") || e.includes("skipped")) return "warn";
  if (e.includes("completed") || e.includes("ok") || e.includes("validated")) return "success";
  if (e.includes("started") || e.includes("dispatched") || e.includes("received")) return "running";
  return "info";
}

function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

type EventMeta = Record<string, string | number | boolean>;

class AiTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`AI request timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
    this.name = "AiTimeoutError";
  }
}

async function withAiTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyAiFailure(err: unknown): { category: "timeout" | "provider" | "network" | "unknown"; message: string } {
  const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
  if (err instanceof AiTimeoutError || /timed out/i.test(message)) {
    return { category: "timeout", message };
  }
  if (/OpenAI request failed|No copilot\/language model|Language Model API is not available/i.test(message)) {
    return { category: "provider", message };
  }
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|socket/i.test(message)) {
    return { category: "network", message };
  }
  return { category: "unknown", message };
}

function aiTraceDetails(ai: AiExecutionDetails): string {
  return [
    `provider=${ai.provider}`,
    `model=${ai.model}`,
    `called_at=${ai.calledAt}`,
    `completed_at=${ai.completedAt}`,
    `duration=${formatDurationMs(ai.durationMs)} (${ai.durationMs}ms)`
  ].join(" | ");
}

function aiRequestTraceContent(ai: AiExecutionDetails): string {
  return JSON.stringify({
    provider: ai.provider,
    model: ai.model,
    taskType: ai.taskType,
    calledAt: ai.calledAt,
    systemPrompt: ai.systemPrompt,
    userPrompt: ai.userPrompt,
    requestPayload: ai.requestPayload
  }, null, 2);
}

function aiResponseTraceContent(ai: AiExecutionDetails): string {
  return JSON.stringify({
    provider: ai.provider,
    model: ai.model,
    taskType: ai.taskType,
    calledAt: ai.calledAt,
    completedAt: ai.completedAt,
    durationMs: ai.durationMs,
    responseText: ai.responseText
  }, null, 2);
}

type AiDispatchPreview = {
  provider: "openai" | "copilot";
  model: string;
  taskType: string;
  calledAt: string;
  systemPrompt: string;
  userPrompt: string;
  requestPayload: Record<string, unknown>;
};

function buildAiDispatchPreview(taskType: string, userPrompt: string): AiDispatchPreview {
  const cfg = vscode.workspace.getConfiguration("flowtest");
  const providerRaw = String(cfg.get<string>("aiProvider", "copilot")).toLowerCase();
  const provider: "openai" | "copilot" = providerRaw === "openai" ? "openai" : "copilot";
  const model = provider === "openai"
    ? String(cfg.get<string>("openaiModel", "gpt-5.4-mini"))
    : "copilot-selected-model";
  const systemPrompt = [
    "You are FlowTest AI Orchestrator.",
    `Task Type: ${taskType}`,
    "Output rules:",
    "- Prefer strict JSON when the task expects structured output.",
    "- Keep content deterministic and implementation-ready.",
    "- Do not add unrelated commentary."
  ].join("\n");
  const calledAt = new Date().toISOString();
  const requestPayload = provider === "openai"
    ? {
        model,
        instructions: systemPrompt,
        input: userPrompt
      }
    : {
        model,
        transport: "vscode.lm",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      };
  return { provider, model, taskType, calledAt, systemPrompt, userPrompt, requestPayload };
}

function aiRequestPreviewContent(preview: AiDispatchPreview): string {
  return JSON.stringify({
    provider: preview.provider,
    model: preview.model,
    taskType: preview.taskType,
    calledAt: preview.calledAt,
    systemPrompt: preview.systemPrompt,
    userPrompt: preview.userPrompt,
    requestPayload: preview.requestPayload
  }, null, 2);
}

function aiDispatchDetail(preview: AiDispatchPreview, timeoutMs: number): string {
  return [
    `task=${preview.taskType}`,
    `provider=${preview.provider}`,
    `model=${preview.model}`,
    "model_version=latest",
    "temperature=default",
    `timeout_ms=${timeoutMs}`,
    `called_at=${preview.calledAt}`
  ].join(" | ");
}

async function runScenarioOnEngine(scenarioObj: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: string }> {
  const engineBaseUrl = vscode.workspace.getConfiguration("flowtest").get<string>("engineBaseUrl", "http://localhost:8080");
  const response = await fetch(`${engineBaseUrl}/api/scenarios/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: scenarioObj })
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

async function runScenarioOnTemporal(scenarioObj: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: string; workflowId?: string; runId?: string }> {
  const engineBaseUrl = vscode.workspace.getConfiguration("flowtest").get<string>("engineBaseUrl", "http://localhost:8080");
  const response = await fetch(`${engineBaseUrl}/api/scenarios/run-temporal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: scenarioObj })
  });
  const body = await response.text();
  let workflowId = "";
  let runId = "";
  try {
    const parsed = JSON.parse(body);
    workflowId = String(parsed?.workflowId ?? "");
    runId = String(parsed?.runId ?? "");
  } catch {
    // ignore parse errors
  }
  return { ok: response.ok, status: response.status, body, workflowId, runId };
}

function slug(raw: string): string {
  return (raw || "run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "run";
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

function workspaceRootPath(): string | null {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || ws.length === 0) return null;
  return ws[0].uri.fsPath;
}

async function resolveOutputBasePath(intake: StartIntakePayload): Promise<string | null> {
  const configured = String(intake.outputPath || "").trim();
  if (configured) return configured;
  const root = workspaceRootPath();
  if (!root) return null;
  const dirName = `${new Date().toISOString().replace(/[:.]/g, "-")}_${slug(intake.runName)}`;
  return path.join(root, ".flowtest-runs", dirName);
}

async function persistGeneratedOutputs(basePath: string, outputs: {
  apiSpec: string;
  wiremock: string;
  scenario: string;
  engineResult: string;
}): Promise<Record<string, string>> {
  await fs.mkdir(basePath, { recursive: true });
  const files = {
    apiSpec: path.join(basePath, "api-spec.md"),
    wiremock: path.join(basePath, "wiremock-mappings.json"),
    scenario: path.join(basePath, "scenario.dsl.json"),
    engineResult: path.join(basePath, "engine-run-result.json")
  };
  await fs.writeFile(files.apiSpec, outputs.apiSpec, "utf8");
  await fs.writeFile(files.wiremock, outputs.wiremock, "utf8");
  await fs.writeFile(files.scenario, outputs.scenario, "utf8");
  await fs.writeFile(files.engineResult, outputs.engineResult, "utf8");
  return files;
}

async function handleStartCommand(
  extensionUri: vscode.Uri,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const intake = await openStartIntakeForm({
    extensionUri,
    title: "FlowTest Start Intake"
  });

  if (!intake) {
    notifyCancelled("FlowTest intake cancelled.");
    return resultWithFollowups(defaultFollowups());
  }

  const orchestrationId = randomUUID();
  const temporalUiBase = vscode.workspace.getConfiguration("flowtest").get<string>(
    "flowtest.temporalUiUrl",
    "http://localhost:8233/namespaces/default/workflows"
  );
  let temporalLink = `${temporalUiBase}`;
  const plannedOutputBasePath = await resolveOutputBasePath(intake);
  const statusPanel = FlowtestStatusPanel.createOrShow(extensionUri);
  const aiTimeoutMs = Math.max(
    15000,
    Number(vscode.workspace.getConfiguration("flowtest").get<number>("aiTimeoutMs", 120000))
  );
  const verboseLines: string[] = [];
  const pushVerbose = (
    stage: string,
    event: string,
    details?: string,
    actions?: Array<{ label: string; title: string; content: string }>,
    meta?: EventMeta
  ) => {
    verboseLines.push(verboseEvent(stage, event, details));
    statusPanel.pushEvent({
      time: tsShort(),
      stage: prettyStage(stage),
      status: verboseStatusFromEvent(event),
      title: prettyLabel(event),
      detail: details,
      actions,
      meta
    });
  };
  const cancelRun = (detail: string) => {
    pushVerbose("RUN", "cancelled", detail);
    statusPanel.setSummary({ status: "Cancelled", detail });
  };
  const failRunFromAi = (
    stage: "API_SPEC" | "WIREMOCK" | "SCENARIO_DSL",
    stepLabel: string,
    dispatch: AiDispatchPreview,
    err: unknown,
    actions: Array<{ label: string; title: string; content: string }>
  ): vscode.ChatResult => {
    const classified = classifyAiFailure(err);
    const detail = `${stepLabel} failed (${classified.category}) | ${classified.message}`;
    pushVerbose(stage, "failed", detail, actions, {
      task: dispatch.taskType,
      provider: dispatch.provider,
      model: dispatch.model,
      called_at: dispatch.calledAt,
      timeout_ms: aiTimeoutMs,
      error: true,
      error_category: classified.category,
      error_message: classified.message
    });
    statusPanel.setSummary({ status: "Failed", detail });
    pushVerbose("RUN", "failed", `${stage.toLowerCase()} failed`);
    stream.markdown([
      `### ${prettyStage(stage)} Generation`,
      "",
      "- **Status:** Failed",
      `- **Reason:** \`${classified.message}\``,
      `- **Category:** ${classified.category}`,
      `- **Provider:** ${dispatch.provider}`,
      `- **Model:** ${dispatch.model}`
    ].join("\n"));
    stream.markdown("\n### Verbose Event Hook\n\n" + verboseLines.join("\n"));
    pushVerbose("UI", "verbose_section_rendered");
    return resultWithFollowups(defaultFollowups());
  };

  statusPanel.initRun({
    runName: intake.runName,
    orchestrationId,
    temporalLink,
    successCount: intake.successSamples.length,
    failureCount: intake.failureSamples.length,
    intakeMode: intake.multiUpload ? "multi upload" : "row mode",
    outputPath: plannedOutputBasePath ?? "pending (.flowtest-runs)",
    wiremockBaseUrl: "pending (engine will publish base URL)"
  });
  pushVerbose("RUN", "started", `runName=${intake.runName}`);
  statusPanel.setSummary({ status: "Running", detail: "Initializing..." });
  pushVerbose("UI", "status_panel_initialized");
  if (intake.fakeRun) {
    const fx = createFakeRunFixture();
    statusPanel.setSummary({ status: "Running", detail: fx.summaryStart });
    for (const ev of fx.events) {
      await new Promise((r) => setTimeout(r, fx.intervalMs));
      statusPanel.pushEvent(ev);
    }
    statusPanel.setSummary({ status: "Completed", detail: fx.summaryEnd });
    stream.markdown("### Fake Run Completed");
    stream.markdown("- Timeline events were generated from faker fixture.");
    return resultWithFollowups(defaultFollowups());
  }
  pushVerbose(
    "INTAKE",
    "received",
    `docs=${intakeToDocs(intake).length} | intake_mode=${intake.multiUpload ? "multi_upload" : "row_mode"} | output_path=${plannedOutputBasePath ?? "pending"}`
  );

  stream.markdown([
    "## FlowTest Start Audit",
    "",
    `- **Run Name:** \`${intake.runName}\``,
    `- **Orchestration ID:** \`${orchestrationId}\``,
    `- **Temporal UI:** ${temporalLink}`,
    `- **Success Samples:** ${intake.successSamples.length}`,
    `- **Failure Samples:** ${intake.failureSamples.length}`,
    `- **Intake Mode:** ${intake.multiUpload ? "multi upload" : "row mode"}`
  ].join("\n"));
  if ((intake.additionalInfo ?? "").trim()) {
    stream.markdown("- **Additional Info:** provided");
    pushVerbose("INTAKE", "additional_info_visible");
  }
  stream.markdown("\n### Intake Evidence\n\n" + summarizeDocsMarkdown(intakeToDocs(intake)));
  pushVerbose("UI", "intake_evidence_rendered");
  pushVerbose("UI", "audit_header_rendered");
  for (const d of intakeToDocs(intake)) {
    const file = d.fileName || d.title || "untitled";
    pushVerbose("INTAKE", "doc_loaded", `[${d.type}] ${file} (${d.content.length} chars)`);
  }

  if (token.isCancellationRequested) {
    cancelRun("after intake render");
    return resultWithFollowups(defaultFollowups());
  }

  const docsText = intakeToDocs(intake)
    .map((r) => `### ${r.type}: ${r.title || r.fileName || "untitled"}\n${r.content}`)
    .join("\n\n");
  const additionalInfoText = (intake.additionalInfo ?? "").trim();
  const promptContextAddon = additionalInfoText
    ? `\n\n### ADDITIONAL_INFORMATION\n${additionalInfoText}`
    : "";
  pushVerbose("INTAKE", "normalized", `doc payload size=${docsText.length} chars`);
  if (additionalInfoText) {
    pushVerbose("INTAKE", "additional_info_attached", `${additionalInfoText.length} chars`);
  }

  stream.progress("Generating API spec...");
  statusPanel.setSummary({ status: "Running", detail: "Generating API spec..." });
  pushVerbose("UI", "progress", "Generating API spec...");
  pushVerbose("API_SPEC", "started");
  const apiSpecPrompt = `Generate normalized API spec from these docs.\n\n${docsText}${promptContextAddon}`;
  const apiSpecDispatch = buildAiDispatchPreview("GENERATE_API_SPEC", apiSpecPrompt);
  pushVerbose(
    "API_SPEC",
    "ai_request_dispatched",
    aiDispatchDetail(apiSpecDispatch, aiTimeoutMs),
    [{
      label: "AI Request",
      title: "API Spec - AI Request",
      content: aiRequestPreviewContent(apiSpecDispatch)
    }],
    {
      task: "GENERATE_API_SPEC",
      provider: apiSpecDispatch.provider,
      model: apiSpecDispatch.model,
      model_version: "latest",
      temperature: "default",
      called_at: apiSpecDispatch.calledAt,
      error: false
    }
  );
  let apiSpecAi: AiExecutionDetails;
  try {
    apiSpecAi = await withAiTimeout(
      executeAiTaskDetailed({
        taskType: "GENERATE_API_SPEC",
        prompt: apiSpecPrompt,
        context: { orchestrationId, runName: intake.runName }
      }),
      aiTimeoutMs
    );
  } catch (err) {
    return failRunFromAi(
      "API_SPEC",
      "API spec generation",
      apiSpecDispatch,
      err,
      [{ label: "AI Request", title: "API Spec - AI Request", content: aiRequestPreviewContent(apiSpecDispatch) }]
    );
  }
  const apiSpecOutput = apiSpecAi.responseText;
  pushVerbose(
    "API_SPEC",
    "ai_response_received",
    `${apiSpecOutput.length} chars | ${aiTraceDetails(apiSpecAi)}`,
    [
      { label: "AI Request", title: "API Spec - AI Request", content: aiRequestTraceContent(apiSpecAi) },
      { label: "AI Response", title: "API Spec - AI Response", content: aiResponseTraceContent(apiSpecAi) }
    ],
    {
      task: "GENERATE_API_SPEC",
      provider: apiSpecAi.provider,
      model: apiSpecAi.model,
      called_at: apiSpecAi.calledAt,
      completed_at: apiSpecAi.completedAt,
      duration_ms: apiSpecAi.durationMs,
      response_chars: apiSpecOutput.length,
      error: false
    }
  );
  stream.markdown([
    "### API Spec Generation",
    "",
    "- **Status:** Completed"
  ].join("\n"));
  pushVerbose("UI", "api_spec_section_rendered");
  pushVerbose(
    "API_SPEC",
    "completed",
    undefined,
    [{ label: "Generated Spec", title: "API Spec - Generated", content: apiSpecOutput }]
  );

  if (token.isCancellationRequested) {
    cancelRun("after API spec generation");
    return resultWithFollowups(defaultFollowups());
  }

  stream.progress("Generating WireMock definitions...");
  statusPanel.setSummary({ status: "Running", detail: "Generating WireMock definitions..." });
  pushVerbose("UI", "progress", "Generating WireMock definitions...");
  pushVerbose("WIREMOCK", "started");
  const wiremockPrompt = `Generate WireMock mappings using this API understanding:\n\n${apiSpecOutput}${promptContextAddon}`;
  const wiremockDispatch = buildAiDispatchPreview("GENERATE_MOCKS", wiremockPrompt);
  pushVerbose(
    "WIREMOCK",
    "ai_request_dispatched",
    aiDispatchDetail(wiremockDispatch, aiTimeoutMs),
    [{
      label: "AI Request",
      title: "WireMock - AI Request",
      content: aiRequestPreviewContent(wiremockDispatch)
    }],
    {
      task: "GENERATE_MOCKS",
      provider: wiremockDispatch.provider,
      model: wiremockDispatch.model,
      model_version: "latest",
      temperature: "default",
      called_at: wiremockDispatch.calledAt,
      error: false
    }
  );
  let wiremockAi: AiExecutionDetails;
  try {
    wiremockAi = await withAiTimeout(
      executeAiTaskDetailed({
        taskType: "GENERATE_MOCKS",
        prompt: wiremockPrompt,
        context: { orchestrationId, runName: intake.runName }
      }),
      aiTimeoutMs
    );
  } catch (err) {
    return failRunFromAi(
      "WIREMOCK",
      "WireMock generation",
      wiremockDispatch,
      err,
      [{ label: "AI Request", title: "WireMock - AI Request", content: aiRequestPreviewContent(wiremockDispatch) }]
    );
  }
  const mocksOutput = wiremockAi.responseText;
  pushVerbose(
    "WIREMOCK",
    "ai_response_received",
    `${mocksOutput.length} chars | ${aiTraceDetails(wiremockAi)}`,
    [
      { label: "AI Request", title: "WireMock - AI Request", content: aiRequestTraceContent(wiremockAi) },
      { label: "AI Response", title: "WireMock - AI Response", content: aiResponseTraceContent(wiremockAi) }
    ],
    {
      task: "GENERATE_MOCKS",
      provider: wiremockAi.provider,
      model: wiremockAi.model,
      called_at: wiremockAi.calledAt,
      completed_at: wiremockAi.completedAt,
      duration_ms: wiremockAi.durationMs,
      response_chars: mocksOutput.length,
      error: false
    }
  );
  stream.markdown([
    "### Mock Generation",
    "",
    "- **Status:** Completed"
  ].join("\n"));
  pushVerbose("UI", "wiremock_section_rendered");
  pushVerbose(
    "WIREMOCK",
    "completed",
    undefined,
    [{ label: "Generated Mocks", title: "WireMock - Generated", content: mocksOutput }]
  );

  if (token.isCancellationRequested) {
    cancelRun("after WireMock generation");
    return resultWithFollowups(defaultFollowups());
  }

  stream.progress("Generating FlowTest scenario DSL...");
  statusPanel.setSummary({ status: "Running", detail: "Generating FlowTest scenario DSL..." });
  pushVerbose("UI", "progress", "Generating FlowTest scenario DSL...");
  pushVerbose("SCENARIO_DSL", "started");
  const strictSchemaHint = [
    "REQUIRED OUTPUT RULES:",
    "1) Return ONLY one JSON object (no markdown).",
    "2) Top-level keys MUST be: dslVersion, scenarioId, name, steps.",
    "3) steps MUST be an array of objects with: id, type, request.",
    "4) type MUST be one of: api-call, api-assert, log, set-context, sleep.",
    "5) For api-call/api-assert each step request MUST include method and url.",
    "6) Do not return 'flowName' or 'scenarios[]' wrapper."
  ].join("\n");
  const scenarioPrompt =
    "Generate FlowTest DSL scenario JSON using the below artifacts.\n\n" +
    strictSchemaHint +
    "\n\n" +
    "API Understanding:\n" +
    apiSpecOutput +
    "\n\nMock Plan:\n" +
    mocksOutput +
    promptContextAddon;
  const scenarioDispatch = buildAiDispatchPreview("GENERATE_SCENARIO", scenarioPrompt);
  pushVerbose(
    "SCENARIO_DSL",
    "ai_request_dispatched",
    aiDispatchDetail(scenarioDispatch, aiTimeoutMs),
    [{
      label: "AI Request",
      title: "Scenario DSL - AI Request",
      content: aiRequestPreviewContent(scenarioDispatch)
    }],
    {
      task: "GENERATE_SCENARIO",
      provider: scenarioDispatch.provider,
      model: scenarioDispatch.model,
      model_version: "latest",
      temperature: "default",
      called_at: scenarioDispatch.calledAt,
      error: false
    }
  );
  let scenarioAi: AiExecutionDetails;
  try {
    scenarioAi = await withAiTimeout(
      executeAiTaskDetailed({
        taskType: "GENERATE_SCENARIO",
        prompt: scenarioPrompt,
        context: { orchestrationId, runName: intake.runName }
      }),
      aiTimeoutMs
    );
  } catch (err) {
    return failRunFromAi(
      "SCENARIO_DSL",
      "Scenario DSL generation",
      scenarioDispatch,
      err,
      [{ label: "AI Request", title: "Scenario DSL - AI Request", content: aiRequestPreviewContent(scenarioDispatch) }]
    );
  }
  const scenarioOutput = scenarioAi.responseText;
  pushVerbose(
    "SCENARIO_DSL",
    "ai_response_received",
    `${scenarioOutput.length} chars | ${aiTraceDetails(scenarioAi)}`,
    [
      { label: "AI Request", title: "Scenario DSL - AI Request", content: aiRequestTraceContent(scenarioAi) },
      { label: "AI Response", title: "Scenario DSL - AI Response", content: aiResponseTraceContent(scenarioAi) }
    ],
    {
      task: "GENERATE_SCENARIO",
      provider: scenarioAi.provider,
      model: scenarioAi.model,
      called_at: scenarioAi.calledAt,
      completed_at: scenarioAi.completedAt,
      duration_ms: scenarioAi.durationMs,
      response_chars: scenarioOutput.length,
      error: false
    }
  );

  stream.markdown("### Scenario Generation");
  stream.markdown("```json\n" + scenarioOutput + "\n```");
  pushVerbose("UI", "scenario_section_rendered");
  pushVerbose(
    "SCENARIO_DSL",
    "completed",
    undefined,
    [{ label: "Generated DSL", title: "Scenario DSL - Generated", content: scenarioOutput }]
  );

  const scenarioObj = extractJsonObject(scenarioOutput);
  if (!scenarioObj) {
    pushVerbose("SCENARIO_DSL", "json_parse_failed");
    stream.markdown("\n### Verbose Event Hook\n\n" + verboseLines.join("\n"));
    pushVerbose("UI", "verbose_section_rendered");
    stream.markdown("### Engine Run");
    stream.markdown("- **Status:** Skipped (generated scenario was not valid JSON)");
    pushVerbose("ENGINE_RUN", "skipped", "generated scenario was not valid JSON");
    statusPanel.setSummary({
      status: "Failed",
      detail: "Scenario output was not valid JSON"
    });
    pushVerbose("RUN", "failed", "invalid scenario JSON");
    stream.markdown("\n### Evidence Summary");
    stream.markdown([
      "- API spec generated",
      "- WireMock plan generated",
      "- Scenario generation completed (JSON parse failed)",
      `- Temporal UI: ${temporalLink}`
    ].join("\n"));
    pushVerbose("UI", "evidence_summary_rendered");
    return resultWithFollowups(defaultFollowups());
  }
  pushVerbose("SCENARIO_DSL", "json_parse_ok");

  const inferredMocks = normalizeWiremockMocks(extractJsonValue(mocksOutput));
  if (inferredMocks.length > 0) {
    if (Array.isArray((scenarioObj as any).scenarios)) {
      for (const sc of (scenarioObj as any).scenarios as Array<unknown>) {
        if (!sc || typeof sc !== "object") continue;
        const s = sc as Record<string, unknown>;
        if (!Array.isArray((s as any).mocks) || (s as any).mocks.length === 0) {
          s.mocks = inferredMocks;
        }
      }
    } else if (!Array.isArray((scenarioObj as any).mocks) || (scenarioObj as any).mocks.length === 0) {
      (scenarioObj as any).mocks = inferredMocks;
    }
    pushVerbose("WIREMOCK", "mocks_attached_to_scenario", `attached=${inferredMocks.length}`);
  } else {
    pushVerbose("WIREMOCK", "mocks_parse_empty");
  }

  const coverage = countScenarioMockCoverage(scenarioObj);
  pushVerbose("WIREMOCK", "coverage_check", `scenario_mocks=${coverage.mocks} inline_step_mocks=${coverage.inline}`);
  if (coverage.mocks === 0 && coverage.inline === 0) {
    const detail = "No mocks were extracted from WireMock output. Engine run skipped to avoid live API 404.";
    pushVerbose(
      "WIREMOCK",
      "validation_error",
      detail,
      [{ label: "Generated Mocks", title: "WireMock - Generated", content: mocksOutput }]
    );
    statusPanel.setSummary({ status: "Failed", detail });
    pushVerbose("RUN", "failed", "no_mocks_extracted");
    stream.markdown([
      "### WireMock Validation",
      "",
      "- **Status:** Failed",
      "- **Reason:** No mocks could be parsed/attached to scenario.",
      "- **Action:** Regenerate mocks or ensure WireMock output is valid JSON mappings."
    ].join("\n"));
    stream.markdown("\n### Verbose Event Hook\n\n" + verboseLines.join("\n"));
    pushVerbose("UI", "verbose_section_rendered");
    return resultWithFollowups(defaultFollowups());
  }

  const normalizedSet = normalizeScenariosForEngine(scenarioObj);
  const normalizedScenarios: Record<string, unknown>[] = [];
  for (let i = 0; i < normalizedSet.length; i++) {
    const normalized = normalizedSet[i];
    for (const n of normalized.notes) {
      pushVerbose("SCENARIO_DSL", "normalization_note", `[${i + 1}] ${n}`);
    }
    if (normalized.errors.length > 0 || !normalized.scenario) {
      for (const err of normalized.errors) {
        pushVerbose("SCENARIO_DSL", "validation_error", `[${i + 1}] ${err}`);
      }
      stream.markdown("\n### Verbose Event Hook\n\n" + verboseLines.join("\n"));
      pushVerbose("UI", "verbose_section_rendered");
      stream.markdown("### Engine Run");
      stream.markdown("- **Status:** Skipped (generated DSL failed engine-shape validation)");
      stream.markdown("```text\n" + normalized.errors.join("\n") + "\n```");
      pushVerbose("ENGINE_RUN", "skipped", "generated DSL failed engine-shape validation");
      statusPanel.setSummary({
        status: "Failed",
        detail: "Scenario failed engine-shape validation"
      });
      pushVerbose("RUN", "failed", "scenario shape validation failed");
      return resultWithFollowups(defaultFollowups());
    }
    normalizedScenarios.push(normalized.scenario);
  }
  pushVerbose("SCENARIO_DSL", "engine_shape_validated", `${normalizedScenarios.length} scenarios`);

  if (token.isCancellationRequested) {
    cancelRun("before engine execution");
    return resultWithFollowups(defaultFollowups());
  }

  stream.progress("Running FlowTest engine validation...");
  statusPanel.setSummary({ status: "Running", detail: "Running FlowTest engine validation..." });
  pushVerbose("UI", "progress", "Running FlowTest engine validation...");
  const engineRuns: Array<{ ok: boolean; status: number; body: string; workflowId?: string; runId?: string; scenarioId?: string }> = [];
  for (let i = 0; i < normalizedScenarios.length; i++) {
    const scenario = normalizedScenarios[i];
    const scenarioId = String((scenario as any).scenarioId ?? `scenario_${i + 1}`);
    pushVerbose("ENGINE_RUN", "started", `[${i + 1}/${normalizedScenarios.length}] ${scenarioId}`);
    let run: { ok: boolean; status: number; body: string; workflowId?: string; runId?: string };
    try {
      run = await runScenarioOnTemporal(scenario);
    } catch (e: any) {
      const errMsg = e?.message ? String(e.message) : String(e);
      pushVerbose("ENGINE_RUN", "failed", `[${scenarioId}] ${errMsg}`);
      statusPanel.setSummary({
        status: "Failed",
        detail: `Engine request failed: ${errMsg}`
      });
      pushVerbose("RUN", "failed", `engine_request_failed scenario=${scenarioId}`);
      stream.markdown([
        "### Engine Run",
        "",
        "- **Status:** Failed",
        `- **Scenario:** \`${scenarioId}\``,
        `- **Reason:** \`${errMsg}\``
      ].join("\n"));
      stream.markdown("\n### Verbose Event Hook\n\n" + verboseLines.join("\n"));
      pushVerbose("UI", "verbose_section_rendered");
      stream.markdown([
        "### Evidence Summary",
        "",
        "- API spec generated",
        "- WireMock plan generated",
        "- Scenario DSL generated",
        "- Engine validation failed",
        `- Temporal UI: ${temporalLink}`
      ].join("\n"));
      pushVerbose("UI", "evidence_summary_rendered");
      return resultWithFollowups(defaultFollowups());
    }
    engineRuns.push({ ...run, scenarioId });
    if (run.workflowId) {
      temporalLink = run.runId
        ? `${temporalUiBase}/${run.workflowId}/${run.runId}`
        : `${temporalUiBase}/${run.workflowId}`;
      statusPanel.updateTemporal({
        temporalLink,
        workflowId: run.workflowId,
        runId: run.runId
      });
      pushVerbose("ENGINE_RUN", "temporal_workflow_started", `[${scenarioId}] workflowId=${run.workflowId}${run.runId ? ` runId=${run.runId}` : ""}`);
      pushVerbose("UI", "temporal_link_updated", temporalLink);
    }
    pushVerbose(
      "ENGINE_RUN",
      "response_received",
      `[${scenarioId}] http_status=${run.status} body=${run.body.length} chars`
    );
    const allureMeta = extractAllureMetaFromEngineBody(run.body);
    if (allureMeta.resultsPath || allureMeta.reportPath || allureMeta.generateCommand || allureMeta.wiremockBaseUrl) {
      statusPanel.updateMeta({
        allureResultsPath: allureMeta.resultsPath,
        allureReportPath: allureMeta.reportPath,
        allureGenerateCommand: allureMeta.generateCommand,
        wiremockBaseUrl: allureMeta.wiremockBaseUrl
      });
      setPreferredAllurePaths({
        resultsDir: allureMeta.resultsPath,
        reportDir: allureMeta.reportDir
      });
      pushVerbose(
        "ENGINE_RUN",
        "allure_metadata_loaded",
        [
          allureMeta.resultsPath ? `results=${allureMeta.resultsPath}` : "",
          allureMeta.reportPath ? `report=${allureMeta.reportPath}` : ""
        ].filter(Boolean).join(" ")
      );
    }
    pushVerbose(
      "ENGINE_RUN",
      "completed",
      `[${scenarioId}] ${run.ok ? "success" : "failed"}`,
      [{ label: "Engine Output", title: `Engine Run - ${scenarioId}`, content: run.body }]
    );
  }
  const allEngineOk = engineRuns.every((r) => r.ok);
  const engineSummary = {
    success: allEngineOk,
    totalScenarios: engineRuns.length,
    passedScenarios: engineRuns.filter((r) => r.ok).length,
    failedScenarios: engineRuns.filter((r) => !r.ok).length,
    runs: engineRuns.map((r) => {
      try {
        return { scenarioId: r.scenarioId, status: r.status, ok: r.ok, payload: JSON.parse(r.body) };
      } catch {
        return { scenarioId: r.scenarioId, status: r.status, ok: r.ok, payload: r.body };
      }
    })
  };
  const engineSummaryBody = JSON.stringify(engineSummary, null, 2);
  stream.markdown([
    "### Engine Run",
    "",
    `- **Status:** ${allEngineOk ? "Success" : "Failed"}`,
    `- **Scenarios Executed:** ${engineRuns.length}`,
    `- **Passed:** ${engineSummary.passedScenarios}`,
    `- **Failed:** ${engineSummary.failedScenarios}`
  ].join("\n"));
  stream.markdown("```json\n" + engineSummaryBody + "\n```");
  pushVerbose("UI", "engine_section_rendered");
  const outputBasePath = plannedOutputBasePath;
  if (outputBasePath) {
    try {
      pushVerbose("ARTIFACTS", "persist_started", outputBasePath);
      const files = await persistGeneratedOutputs(outputBasePath, {
        apiSpec: apiSpecOutput,
        wiremock: mocksOutput,
        scenario: scenarioOutput,
        engineResult: engineSummaryBody
      });
      pushVerbose(
        "ARTIFACTS",
        "persisted",
        outputBasePath,
        [{
          label: "Output Files",
          title: "Persisted Generated Files",
          content: [
            `Base Path: ${outputBasePath}`,
            "",
            `API Spec: ${files.apiSpec}`,
            `WireMock: ${files.wiremock}`,
            `Scenario DSL: ${files.scenario}`,
            `Engine Result: ${files.engineResult}`
          ].join("\n")
        }]
      );
      statusPanel.updateMeta({ outputPath: outputBasePath });
      stream.markdown([
        "### Generated Files",
        "",
        `- API Spec: \`${files.apiSpec}\``,
        `- WireMock: \`${files.wiremock}\``,
        `- Scenario DSL: \`${files.scenario}\``,
        `- Engine Result: \`${files.engineResult}\``
      ].join("\n"));
      pushVerbose("UI", "artifacts_section_rendered");
    } catch (e: any) {
      pushVerbose("ARTIFACTS", "persist_failed", e?.message ?? String(e));
      stream.markdown(`### Generated Files\n\n- Failed to persist outputs: \`${e?.message ?? String(e)}\``);
    }
  } else {
    pushVerbose("ARTIFACTS", "persist_skipped", "no writable output path resolved");
  }

  pushVerbose("ALLURE", "generate_started");
  stream.progress("Generating Allure report...");
  statusPanel.setSummary({ status: "Running", detail: "Generating Allure report..." });
  const allureReport = await generateAndOpenAllureReport();
  if (allureReport.ok) {
    if (allureReport.reportPath) {
      statusPanel.updateMeta({ allureReportPath: allureReport.reportPath });
    }
    if (allureReport.reportUrl) {
      statusPanel.updateMeta({ allureReportPath: allureReport.reportUrl });
    }
    pushVerbose("ALLURE", "generate_completed", allureReport.reportPath ?? "opened");
    stream.markdown([
      "### Allure",
      "",
      `- **Status:** Opened`,
      allureReport.reportUrl ? `- **URL:** ${allureReport.reportUrl}` : "",
      allureReport.reportPath ? `- **Report:** \`${allureReport.reportPath}\`` : ""
    ].filter(Boolean).join("\n"));
  } else {
    pushVerbose("ALLURE", "generate_failed", allureReport.message);
    stream.markdown([
      "### Allure",
      "",
      `- **Status:** Failed`,
      `- **Reason:** ${allureReport.message}`
    ].join("\n"));
  }

  statusPanel.setSummary({
    status: allEngineOk ? "Completed" : "Failed",
    detail: `Engine scenarios: ${engineSummary.passedScenarios}/${engineSummary.totalScenarios} passed`
  });
  pushVerbose("RUN", allEngineOk ? "completed" : "failed", `engine_passed=${engineSummary.passedScenarios}/${engineSummary.totalScenarios}`);
  stream.markdown("\n### Verbose Event Hook\n\n" + verboseLines.join("\n"));
  pushVerbose("UI", "verbose_section_rendered");

  stream.markdown([
    "### Evidence Summary",
    "",
    "- API spec generated",
    "- WireMock plan generated",
    "- Scenario DSL generated",
    `- Engine validation ${allEngineOk ? "completed" : "failed"}`,
    `- Temporal UI: ${temporalLink}`
  ].join("\n"));
  pushVerbose("UI", "evidence_summary_rendered");
  return resultWithFollowups(defaultFollowups());
}

async function runFakeCommand(
  extensionUri: vscode.Uri,
  stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
  const fx = createFakeRunFixture();
  const statusPanel = FlowtestStatusPanel.createOrShow(extensionUri);
  statusPanel.initRun({
    runName: fx.runName,
    orchestrationId: `${fx.orchestrationPrefix}${randomUUID()}`,
    temporalLink: fx.temporalLink,
    successCount: fx.successCount,
    failureCount: fx.failureCount,
    intakeMode: fx.intakeMode
  });
  statusPanel.setSummary({ status: "Running", detail: fx.summaryStart });
  for (const ev of fx.events) {
    await new Promise((r) => setTimeout(r, fx.intervalMs));
    statusPanel.pushEvent(ev);
  }
  statusPanel.setSummary({ status: "Completed", detail: fx.summaryEnd });
  stream.markdown("### Fake Run Completed");
  stream.markdown("- Timeline events generated from fixture.");
  return resultWithFollowups(defaultFollowups());
}

async function generateFromNormalizedRequest(
  normalizedRequest: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  stream.progress("Generating FlowTest scenario request...");

  if (token.isCancellationRequested) {
    return {};
  }

  const content = await executeAiTask({
    taskType: "GENERATE_SCENARIO",
    prompt: normalizedRequest,
    context: { source: "flowtest-form" }
  });

  if (token.isCancellationRequested) {
    return {};
  }

  stream.markdown("### Generated Output");
  stream.markdown("```json\n" + content + "\n```");

  return resultWithFollowups(defaultFollowups());
}

async function openSpecificForm(
  formId: string,
  extensionUri: vscode.Uri
): Promise<string | null> {
  if (formId === "open_scenario_form") {
    return openScenarioForm({
      extensionUri,
      title: "FlowTest Scenario Builder"
    });
  }
  if (formId === "open_mocks_form") {
    return openMocksForm({
      extensionUri,
      title: "FlowTest Mocks Planner"
    });
  }
  if (formId === "open_vision_form") {
    return openVisionForm({
      extensionUri,
      title: "FlowTest Vision Assertions"
    });
  }
  return null;
}

export function chatRequestHandler(opts: { extensionUri: vscode.Uri }): vscode.ChatRequestHandler {
  const handler: vscode.ChatRequestHandler = async (request, _chatContext, stream, token) => {
    const rawText = (request.prompt ?? "").trim();
    const text = rawText;

    try {
      if (!text || norm(text) === "help") {
        stream.markdown(helpText());
        return resultWithFollowups(defaultFollowups());
      }

      if (norm(text) === "fake" || norm(text) === "fake run") {
        return runFakeCommand(opts.extensionUri, stream);
      }

      if (norm(text) === "start") {
        return handleStartCommand(opts.extensionUri, stream, token);
      }

      if (norm(text) === "forms") {
        while (true) {
          const choice = await openFormsBootstrapForm({
            extensionUri: opts.extensionUri,
            title: "FlowTest Available forms"
          });

          if (!choice) {
            notifyCancelled("FlowTest Forms Bootstrap cancelled.");
            return resultWithFollowups(defaultFollowups());
          }

          const normalizedRequest = await openSpecificForm(choice, opts.extensionUri);
          if (!normalizedRequest) {
            continue;
          }
          return generateFromNormalizedRequest(normalizedRequest, stream, token);
        }
      }

      if (
        norm(text) === "open_scenario_form" ||
        norm(text) === "open_mocks_form" ||
        norm(text) === "open_vision_form"
      ) {
        const normalizedRequest = await openSpecificForm(norm(text), opts.extensionUri);
        if (!normalizedRequest) {
          const formNames = { open_scenario_form: 'Scenario Builder', open_mocks_form: 'Mocks Planner', open_vision_form: 'Vision Assertions' };
          const label = formNames[norm(text) as keyof typeof formNames] || norm(text);
          notifyCancelled(`FlowTest ${label} form cancelled.`);
          return resultWithFollowups(defaultFollowups());
        }
        return generateFromNormalizedRequest(normalizedRequest, stream, token);
      }

      if (norm(text) === "show report") {
        stream.progress("Generating Allure report...");
        const report = await generateAndOpenAllureReport();
        if (!report.ok) {
          stream.markdown(`**FlowTest report error:** ${report.message}`);
          if (report.logs) {
            stream.markdown("```text\n" + report.logs + "\n```");
          }
          return resultWithFollowups(defaultFollowups());
        }
        stream.markdown("### Allure Report");
        stream.markdown(report.message);
        if (report.reportUrl) {
          stream.markdown(report.reportUrl);
        }
        if (report.reportPath) {
          stream.markdown("`" + report.reportPath + "`");
        }
        return resultWithFollowups(defaultFollowups());
      }

      const directPrompt = stripLeadingFlowtestMention(text);
      return generateFromNormalizedRequest(directPrompt, stream, token);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : String(err);
      stream.markdown(`**FlowTest error:** ${msg}`);
      return resultWithFollowups(defaultFollowups());
    }
  };

  return handler;
}
