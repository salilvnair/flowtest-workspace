import type { StartIntakePayload, IntakeDoc } from "@/lib/types";

export type AiTaskType = "GENERATE_API_SPEC" | "GENERATE_MOCKS" | "GENERATE_SCENARIO";

export type AiExecutionDetails = {
  provider: "openai" | "lmstudio";
  model: string;
  taskType: AiTaskType;
  calledAt: string;
  completedAt: string;
  durationMs: number;
  systemPrompt: string;
  userPrompt: string;
  requestPayload: Record<string, unknown>;
  responseText: string;
};

export type IntakeChainResult = {
  prompts: {
    apiSpecPrompt: string;
    wiremockPrompt: string;
    scenarioPrompt: string;
  };
  outputs: {
    apiSpecText: string;
    wiremockText: string;
    scenarioText: string;
  };
  traces: {
    apiSpec: AiExecutionDetails;
    wiremock: AiExecutionDetails;
    scenario: AiExecutionDetails;
  };
  parsed: {
    scenarioJson: Record<string, unknown> | null;
    wiremockMockCount: number;
    attachedMockCount?: number;
    mockCoverageOk?: boolean;
    preflightError?: string | null;
    wiremockBaseUrl?: string | null;
    allureResultsPath?: string | null;
    allureReportPath?: string | null;
    allureGenerateCommand?: string | null;
  };
};

export type IntakeProgressEvent = {
  stage: string;
  status: "info" | "running" | "success" | "warn" | "error";
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
  actions?: Array<{ label: string; title: string; content: string }>;
};

export type IntakeProgressHandler = (event: IntakeProgressEvent) => void | Promise<void>;

function getProvider(): "openai" | "lmstudio" {
  const provider = String(process.env.FLOWTEST_LLM_PROVIDER ?? "openai").toLowerCase();
  return provider === "lmstudio" ? "lmstudio" : "openai";
}

function getModel(provider: "openai" | "lmstudio"): string {
  if (provider === "lmstudio") {
    return String(process.env.LMSTUDIO_MODEL ?? "local-model");
  }
  return String(process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
}

function getEndpoint(provider: "openai" | "lmstudio"): string {
  if (provider === "lmstudio") {
    return process.env.LMSTUDIO_CHAT_URL ?? "http://localhost:1234/v1/chat/completions";
  }
  return process.env.OPENAI_CHAT_URL ?? "https://api.openai.com/v1/chat/completions";
}

function getTimeoutMs(): number {
  const n = Number(process.env.FLOWTEST_AI_TIMEOUT_MS ?? "120000");
  return Number.isFinite(n) ? Math.max(15000, n) : 120000;
}

function buildSystemPrompt(taskType: AiTaskType): string {
  return [
    "You are FlowTest AI Orchestrator.",
    `Task Type: ${taskType}`,
    "Output rules:",
    "- Prefer strict JSON when the task expects structured output.",
    "- Keep content deterministic and implementation-ready.",
    "- Do not add unrelated commentary."
  ].join("\n");
}

class AiTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`AI request timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
    this.name = "AiTimeoutError";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new AiTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractChatText(json: any): string {
  const msg = json?.choices?.[0]?.message?.content;
  if (typeof msg === "string") return msg.trim();
  if (Array.isArray(msg)) {
    return msg
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return JSON.stringify(json);
}

export async function executeAiTaskDetailed(taskType: AiTaskType, prompt: string): Promise<AiExecutionDetails> {
  const provider = getProvider();
  const endpoint = getEndpoint(provider);
  const model = getModel(provider);
  const timeoutMs = getTimeoutMs();
  const calledAt = new Date().toISOString();
  const startedMs = Date.now();
  const systemPrompt = buildSystemPrompt(taskType);
  const userPrompt = prompt;
  const requestPayload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY is missing");
    }
    headers.Authorization = `Bearer ${key}`;
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload)
    },
    timeoutMs
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${raw}`);
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ignore parse; fallback to raw
  }
  const responseText = parsed ? extractChatText(parsed) : raw;
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  return {
    provider,
    model,
    taskType,
    calledAt,
    completedAt,
    durationMs,
    systemPrompt,
    userPrompt,
    requestPayload,
    responseText
  };
}

function intakeToDocs(intake: StartIntakePayload): IntakeDoc[] {
  const docs: IntakeDoc[] = [];
  docs.push(...(intake.successSamples ?? []));
  docs.push(...(intake.failureSamples ?? []));
  if (intake.aid) docs.push(intake.aid);
  if (intake.hld) docs.push(intake.hld);
  return docs;
}

function buildDocsText(intake: StartIntakePayload): string {
  return intakeToDocs(intake)
    .map((r) => `### ${r.type}: ${r.title || r.fileName || "untitled"}\n${r.content}`)
    .join("\n\n");
}

function additionalInfoAddon(intake: StartIntakePayload): string {
  const additionalInfoText = (intake.additionalInfo ?? "").trim();
  if (!additionalInfoText) return "";
  return `\n\n### ADDITIONAL_INFORMATION\n${additionalInfoText}`;
}

function stripJsonFences(raw: string): string {
  const text = String(raw || "").trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? String(match[1] || "").trim() : text;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = stripJsonFences(text);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(raw.slice(first, last + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return null;
}

function extractJsonValue(text: string): unknown {
  const raw = stripJsonFences(text);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  if (Array.isArray((obj as any).mocks)) pushAll((obj as any).mocks as unknown[]);
  else if (Array.isArray((obj as any).mappings)) pushAll((obj as any).mappings as unknown[]);
  else {
    const m = one(obj);
    if (m) out.push(m);
  }
  return out;
}

function preferSuccessMappings(mocks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const statusOf = (m: Record<string, unknown>): number => {
    const response = m?.response;
    if (!response || typeof response !== "object") return 200;
    const n = Number((response as any).status ?? 200);
    return Number.isFinite(n) ? n : 200;
  };
  const success = mocks.filter((m) => statusOf(m) >= 200 && statusOf(m) < 400);
  return success.length > 0 ? success : mocks;
}

function countScenarioMockCoverage(input: Record<string, unknown>): { mocks: number; inline: number } {
  const countInlineInSteps = (steps: unknown): number => {
    if (!Array.isArray(steps)) return 0;
    let n = 0;
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const req = (step as any).request;
      if (req && typeof req === "object" && (req as any)._flowtestMockResponse !== undefined) n++;
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

function attachInferredMocksToScenario(
  scenarioObj: Record<string, unknown>,
  inferredMocks: Array<Record<string, unknown>>
): number {
  if (!inferredMocks.length) return 0;
  let attached = 0;
  if (Array.isArray((scenarioObj as any).scenarios)) {
    for (const sc of (scenarioObj as any).scenarios as Array<unknown>) {
      if (!sc || typeof sc !== "object") continue;
      const s = sc as Record<string, unknown>;
      if (!Array.isArray((s as any).mocks) || (s as any).mocks.length === 0) {
        (s as any).mocks = inferredMocks;
        attached += inferredMocks.length;
      }
    }
  } else if (!Array.isArray((scenarioObj as any).mocks) || (scenarioObj as any).mocks.length === 0) {
    (scenarioObj as any).mocks = inferredMocks;
    attached += inferredMocks.length;
  }
  return attached;
}

export async function runIntakePromptChain(
  intake: StartIntakePayload,
  onProgress?: IntakeProgressHandler
): Promise<IntakeChainResult> {
  const docsText = buildDocsText(intake);
  const addon = additionalInfoAddon(intake);
  const provider = getProvider();
  const model = getModel(provider);

  const apiSpecPrompt = `Generate normalized API spec from these docs.\n\n${docsText}${addon}`;
  const apiSpecStartedAt = new Date().toISOString();
  await onProgress?.({
    stage: "API Spec",
    status: "running",
    title: "Ai Request Dispatched",
    detail: "task=GENERATE_API_SPEC",
    meta: {
      task: "GENERATE_API_SPEC",
      provider,
      model,
      called_at: apiSpecStartedAt
    }
  });
  const apiSpec = await executeAiTaskDetailed("GENERATE_API_SPEC", apiSpecPrompt);
  await onProgress?.({
    stage: "API Spec",
    status: "success",
    title: "Ai Response Received",
    detail: `${String(apiSpec.responseText || "").length} chars`,
    meta: {
      provider: apiSpec.provider,
      model: apiSpec.model,
      called_at: apiSpec.calledAt,
      completed_at: apiSpec.completedAt,
      duration_ms: apiSpec.durationMs
    },
    actions: [
      { label: "AI Request", title: "API Spec - AI Request", content: JSON.stringify(apiSpec.requestPayload, null, 2) },
      { label: "AI Response", title: "API Spec - AI Response", content: String(apiSpec.responseText || "") }
    ]
  });

  const wiremockPrompt = `Generate WireMock mappings using this API understanding:\n\n${apiSpec.responseText}${addon}`;
  const wiremockStartedAt = new Date().toISOString();
  await onProgress?.({
    stage: "WireMock",
    status: "running",
    title: "Ai Request Dispatched",
    detail: "task=GENERATE_MOCKS",
    meta: {
      task: "GENERATE_MOCKS",
      provider,
      model,
      called_at: wiremockStartedAt
    }
  });
  const wiremock = await executeAiTaskDetailed("GENERATE_MOCKS", wiremockPrompt);
  await onProgress?.({
    stage: "WireMock",
    status: "success",
    title: "Ai Response Received",
    detail: `${String(wiremock.responseText || "").length} chars`,
    meta: {
      provider: wiremock.provider,
      model: wiremock.model,
      called_at: wiremock.calledAt,
      completed_at: wiremock.completedAt,
      duration_ms: wiremock.durationMs
    },
    actions: [
      { label: "AI Request", title: "WireMock - AI Request", content: JSON.stringify(wiremock.requestPayload, null, 2) },
      { label: "AI Response", title: "WireMock - AI Response", content: String(wiremock.responseText || "") }
    ]
  });

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
    apiSpec.responseText +
    "\n\nMock Plan:\n" +
    wiremock.responseText +
    addon;
  await onProgress?.({
    stage: "Scenario DSL",
    status: "running",
    title: "Ai Request Dispatched",
    detail: "task=GENERATE_SCENARIO",
    meta: {
      task: "GENERATE_SCENARIO",
      provider,
      model,
      called_at: new Date().toISOString()
    }
  });
  const scenario = await executeAiTaskDetailed("GENERATE_SCENARIO", scenarioPrompt);
  await onProgress?.({
    stage: "Scenario DSL",
    status: "success",
    title: "Ai Response Received",
    detail: `${String(scenario.responseText || "").length} chars`,
    meta: {
      provider: scenario.provider,
      model: scenario.model,
      called_at: scenario.calledAt,
      completed_at: scenario.completedAt,
      duration_ms: scenario.durationMs
    },
    actions: [
      { label: "AI Request", title: "Scenario DSL - AI Request", content: JSON.stringify(scenario.requestPayload, null, 2) },
      { label: "AI Response", title: "Scenario DSL - AI Response", content: String(scenario.responseText || "") }
    ]
  });

  const scenarioJson = extractJsonObject(scenario.responseText);
  const wiremockJson = extractJsonValue(wiremock.responseText);
  const normalizedMocks = normalizeWiremockMocks(wiremockJson);
  const happyPathHint =
    /happy/i.test(String(intake.runName || "")) ||
    /happy/i.test(String(intake.additionalInfo || "")) ||
    /happy/i.test(String((scenarioJson as any)?.scenarioId || "")) ||
    /happy/i.test(String((scenarioJson as any)?.name || ""));
  const effectiveMocks = happyPathHint ? preferSuccessMappings(normalizedMocks) : normalizedMocks;
  let attachedMockCount = 0;
  let mockCoverageOk = false;
  let preflightError: string | null = null;

  if (!scenarioJson) {
    preflightError = "Scenario output was not valid JSON";
    await onProgress?.({
      stage: "Scenario DSL",
      status: "error",
      title: "Json Parse Failed",
      detail: preflightError
    });
  } else {
    attachedMockCount = attachInferredMocksToScenario(scenarioJson, effectiveMocks);
    const coverage = countScenarioMockCoverage(scenarioJson);
    mockCoverageOk = coverage.mocks > 0 || coverage.inline > 0;
    if (!mockCoverageOk) {
      preflightError = "No mocks were extracted/attached. Engine run skipped to avoid live API 404.";
      await onProgress?.({
        stage: "WireMock",
        status: "warn",
        title: "Mocks Parse Empty",
        detail: preflightError,
        meta: {
          wiremock_mocks: effectiveMocks.length,
          attached_mocks: attachedMockCount,
          coverage_ok: false,
          preflight_error: preflightError
        }
      });
    } else {
      await onProgress?.({
        stage: "WireMock",
        status: "success",
        title: "Coverage Check",
        detail: `wiremock_mocks=${effectiveMocks.length} | attached_mocks=${attachedMockCount} | coverage_ok=true`,
        meta: {
          wiremock_mocks: effectiveMocks.length,
          attached_mocks: attachedMockCount,
          coverage_ok: true
        }
      });
    }
  }

  return {
    prompts: {
      apiSpecPrompt,
      wiremockPrompt,
      scenarioPrompt
    },
    outputs: {
      apiSpecText: apiSpec.responseText,
      wiremockText: wiremock.responseText,
      scenarioText: scenario.responseText
    },
    traces: {
      apiSpec,
      wiremock,
      scenario
    },
    parsed: {
      scenarioJson,
      wiremockMockCount: effectiveMocks.length,
      attachedMockCount,
      mockCoverageOk,
      preflightError
    }
  };
}
