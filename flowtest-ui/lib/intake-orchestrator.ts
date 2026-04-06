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
    scenariosJson?: Array<Record<string, unknown>>;
    apiCoverageMatrix?: Array<Record<string, unknown>>;
    coverageError?: string | null;
    wiremockMockCount: number;
    attachedMockCount?: number;
    mockCoverageOk?: boolean;
    scenarioMode?: "quick" | "extensive";
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

type ScenarioMode = "quick" | "extensive";
type ScenarioProfile = {
  mode: ScenarioMode;
  minPerApi: number;
  maxPerApi: number;
  successPerApiHint: number;
  failurePerApiHint: number;
  apisPerCall: number;
  scenarioTimeoutMs: number;
};

function getProvider(): "openai" | "lmstudio" {
  const provider = String(process.env.FLOWTEST_LLM_PROVIDER ?? "openai").toLowerCase();
  return provider === "lmstudio" ? "lmstudio" : "openai";
}

function getModel(provider: "openai" | "lmstudio"): string {
  if (provider === "lmstudio") {
    return String(process.env.LMSTUDIO_MODEL ?? "local-model");
  }
  return String(process.env.OPENAI_MODEL ?? "gpt-5.2");
}

function getEndpoint(provider: "openai" | "lmstudio"): string {
  if (provider === "lmstudio") {
    return process.env.LMSTUDIO_CHAT_URL ?? "http://localhost:1234/v1/chat/completions";
  }
  return process.env.OPENAI_CHAT_URL ?? "https://api.openai.com/v1/chat/completions";
}

function getTimeoutMs(): number {
  const n = Number(process.env.FLOWTEST_AI_TIMEOUT_MS ?? "90000");
  return Number.isFinite(n) ? Math.max(15000, n) : 90000;
}

function getAiMaxRetries(): number {
  const n = Number(process.env.FLOWTEST_AI_MAX_RETRIES ?? "2");
  if (!Number.isFinite(n)) return 2;
  return Math.max(0, Math.min(5, Math.trunc(n)));
}

function getDefaultApisPerScenarioCall(): number {
  const n = Number(process.env.FLOWTEST_SCENARIO_APIS_PER_CALL ?? "2");
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

function resolveScenarioMode(intake: StartIntakePayload): ScenarioMode {
  const explicit = String((intake as any)?.scenarioMode || "").trim().toLowerCase();
  if (explicit === "quick" || explicit === "extensive") return explicit as ScenarioMode;
  const envMode = String(process.env.FLOWTEST_SCENARIO_MODE ?? "").trim().toLowerCase();
  if (envMode === "quick" || envMode === "extensive") return envMode as ScenarioMode;
  return "quick";
}

function getScenarioProfile(mode: ScenarioMode): ScenarioProfile {
  const defaultApisPerCall = getDefaultApisPerScenarioCall();
  if (mode === "extensive") {
    const timeout = Number(process.env.FLOWTEST_SCENARIO_TIMEOUT_EXTENSIVE_MS ?? "600000");
    return {
      mode,
      minPerApi: 6,
      maxPerApi: 6,
      successPerApiHint: 3,
      failurePerApiHint: 3,
      apisPerCall: Math.max(1, Math.min(6, defaultApisPerCall)),
      scenarioTimeoutMs: Number.isFinite(timeout) ? Math.max(30000, timeout) : 600000
    };
  }
  const timeout = Number(process.env.FLOWTEST_SCENARIO_TIMEOUT_QUICK_MS ?? "300000");
  return {
    mode,
    minPerApi: 2,
    maxPerApi: 2,
    successPerApiHint: 1,
    failurePerApiHint: 1,
    apisPerCall: Math.max(1, Math.min(10, defaultApisPerCall)),
    scenarioTimeoutMs: Number.isFinite(timeout) ? Math.max(15000, timeout) : 300000
  };
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

function isRetryableStatus(code: number): boolean {
  return code === 408 || code === 409 || code === 425 || code === 429 || (code >= 500 && code <= 599);
}

function isRetryableError(err: unknown): boolean {
  const name = String((err as any)?.name || "");
  const msg = String((err as any)?.message || err || "").toLowerCase();
  if (name === "AiTimeoutError" || name === "AbortError") return true;
  return msg.includes("fetch failed")
    || msg.includes("other side closed")
    || msg.includes("socket hang up")
    || msg.includes("econnreset")
    || msg.includes("etimedout")
    || msg.includes("timeout")
    || msg.includes("network");
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function executeAiTaskDetailed(
  taskType: AiTaskType,
  prompt: string,
  options?: { timeoutMs?: number; maxRetries?: number }
): Promise<AiExecutionDetails> {
  const provider = getProvider();
  const endpoint = getEndpoint(provider);
  const model = getModel(provider);
  const timeoutMs = Number.isFinite(options?.timeoutMs as number) ? Math.max(15000, Number(options?.timeoutMs)) : getTimeoutMs();
  const maxRetries = Number.isFinite(options?.maxRetries as number)
    ? Math.max(0, Math.min(5, Math.trunc(Number(options?.maxRetries))))
    : getAiMaxRetries();
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

  let response: Response | null = null;
  let raw = "";
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestPayload)
        },
        timeoutMs
      );
      raw = await response.text();
      if (!response.ok) {
        if (attempt < maxRetries && isRetryableStatus(response.status)) {
          await waitMs(400 * (attempt + 1));
          continue;
        }
        throw new Error(`LLM request failed (${response.status}): ${raw}`);
      }
      break;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < maxRetries && isRetryableError(error)) {
        await waitMs(400 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  if (!response || !response.ok) {
    const fallback = String((lastError as any)?.message || lastError || "LLM request failed");
    throw new Error(fallback);
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
    // keep trying: extract first JSON object block
    const firstObj = raw.indexOf("{");
    const lastObj = raw.lastIndexOf("}");
    if (firstObj >= 0 && lastObj > firstObj) {
      try {
        return JSON.parse(raw.slice(firstObj, lastObj + 1));
      } catch {
        // ignore
      }
    }

    // or first JSON array block
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
}

function normalizeScenarioSuite(value: unknown): Array<Record<string, unknown>> {
  const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  if (Array.isArray(value)) {
    const out: Array<Record<string, unknown>> = [];
    for (const raw of value as Array<unknown>) {
      const obj = asObject(raw);
      if (obj) out.push(obj);
    }
    return out;
  }

  const rootObj = asObject(value);
  if (!rootObj) return [];

  if (Array.isArray((rootObj as any).scenarios)) {
    const out: Array<Record<string, unknown>> = [];
    for (const raw of (rootObj as any).scenarios as Array<unknown>) {
      const obj = asObject(raw);
      if (obj) out.push(obj);
    }
    return out;
  }

  return [rootObj];
}

function normalizePath(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "/";
  const cleaned = s.replace(/\{\{\s*baseUrl\s*\}\}/gi, "").trim();
  if (!cleaned) return "/";
  try {
    const u = new URL(cleaned.startsWith("http://") || cleaned.startsWith("https://") ? cleaned : `http://dummy${cleaned.startsWith("/") ? "" : "/"}${cleaned}`);
    return (u.pathname || "/").trim() || "/";
  } catch {
    const q = cleaned.indexOf("?");
    const p = q >= 0 ? cleaned.slice(0, q) : cleaned;
    return p.startsWith("/") ? p : `/${p}`;
  }
}

function isFailureScenario(scenario: Record<string, unknown>): boolean {
  const id = String((scenario as any).scenarioId ?? "").toLowerCase();
  const name = String((scenario as any).name ?? "").toLowerCase();
  const tags = Array.isArray((scenario as any).tags) ? (scenario as any).tags.map((t: unknown) => String(t).toLowerCase()).join(" ") : "";
  const text = `${id} ${name} ${tags}`;
  return /(negative|fail|failure|error|invalid|reject|rejected|conflict|mismatch|missing|blocked|timeout|duplicate)/.test(text);
}

function isSuccessScenario(scenario: Record<string, unknown>): boolean {
  const id = String((scenario as any).scenarioId ?? "").toLowerCase();
  const name = String((scenario as any).name ?? "").toLowerCase();
  const tags = Array.isArray((scenario as any).tags) ? (scenario as any).tags.map((t: unknown) => String(t).toLowerCase()).join(" ") : "";
  const text = `${id} ${name} ${tags}`;
  return /(happy|success|positive|valid|pass)/.test(text);
}

function computeApiCoverageMatrix(
  apiSpecValue: unknown,
  scenarios: Array<Record<string, unknown>>,
  rangeMin: number,
  rangeMax: number
): {
  matrix: Array<Record<string, unknown>>;
  missingFailure: string[];
  missingSuccess: string[];
  outOfRange: string[];
} {
  const apis = Array.isArray((apiSpecValue as any)?.apis) ? ((apiSpecValue as any).apis as Array<any>) : [];
  const targets = apis
    .filter((a) => a && typeof a === "object")
    .map((a, i) => ({
      apiId: String(a.apiId || `api-${i + 1}`),
      method: String(a.method || "POST").toUpperCase(),
      path: normalizePath(a.path || "/")
    }));

  const byKey = new Map<string, {
    apiId: string;
    method: string;
    path: string;
    scenarios: Set<string>;
    successScenarios: Set<string>;
    failureScenarios: Set<string>;
  }>();

  for (const t of targets) {
    const key = `${t.method} ${t.path}`;
    byKey.set(key, {
      ...t,
      scenarios: new Set<string>(),
      successScenarios: new Set<string>(),
      failureScenarios: new Set<string>()
    });
  }

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const sid = String((scenario as any).scenarioId || `scenario-${i + 1}`);
    const steps = Array.isArray((scenario as any).steps) ? (scenario as any).steps as Array<any> : [];
    const failLike = isFailureScenario(scenario);
    const successLike = isSuccessScenario(scenario) || !failLike;
    const seenInScenario = new Set<string>();

    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const type = String((step as any).type || "");
      if (type !== "api-call" && type !== "api-assert") continue;
      const req = (step as any).request;
      if (!req || typeof req !== "object") continue;
      const method = String((req as any).method || "POST").toUpperCase();
      const path = normalizePath((req as any).url || "/");
      const key = `${method} ${path}`;
      if (byKey.has(key)) seenInScenario.add(key);
    }

    for (const key of seenInScenario) {
      const row = byKey.get(key);
      if (!row) continue;
      row.scenarios.add(sid);
      if (failLike) row.failureScenarios.add(sid);
      if (successLike) row.successScenarios.add(sid);
    }
  }

  const matrix: Array<Record<string, unknown>> = [];
  const missingFailure: string[] = [];
  const missingSuccess: string[] = [];
  const outOfRange: string[] = [];

  for (const row of byKey.values()) {
    const total = row.scenarios.size;
    const successCount = row.successScenarios.size;
    const failureCount = row.failureScenarios.size;
    const key = `${row.method} ${row.path}`;
    if (failureCount === 0) missingFailure.push(key);
    if (successCount === 0) missingSuccess.push(key);
    if (total < rangeMin || total > rangeMax) {
      outOfRange.push(`${key} (${total})`);
    }
    matrix.push({
      apiId: row.apiId,
      method: row.method,
      path: row.path,
      totalScenarios: total,
      successScenarios: successCount,
      failureScenarios: failureCount,
      scenarioIds: Array.from(row.scenarios)
    });
  }

  return { matrix, missingFailure, missingSuccess, outOfRange };
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
    const normalized: Record<string, unknown> = { request, response };
    if ((obj as any).priority !== undefined) normalized.priority = (obj as any).priority;
    if ((obj as any).id !== undefined) normalized.id = (obj as any).id;
    if ((obj as any).name !== undefined) normalized.name = (obj as any).name;
    if ((obj as any).scenarioName !== undefined) normalized.scenarioName = (obj as any).scenarioName;
    return normalized;
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

type BodyConstraint = {
  path: string;
  value?: unknown;
  hasValue: boolean;
  enforce: boolean;
};

type MockMatcher = {
  method: string;
  path: string;
  status: number;
  constraints: BodyConstraint[];
};

function readJsonPathValue(body: any, jsonPath: string): unknown {
  const raw = String(jsonPath || "").trim();
  const dotPath = raw.startsWith("$.") ? raw.slice(2) : raw.startsWith("$") ? raw.slice(1) : raw;
  if (!dotPath) return undefined;
  const segments = dotPath.split(".").map((s) => s.replace(/\[0\]/g, "")).filter(Boolean);
  let cur = body;
  for (const seg of segments) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as any)[seg];
  }
  return cur;
}

function isSimpleJsonPath(jsonPath: string): boolean {
  const p = String(jsonPath || "").trim();
  if (!p) return false;
  if (!p.startsWith("$.")) return false;
  if (p.includes("[?(") || p.includes("@.") || p.includes("==") || p.includes("!=")) return false;
  return /^(\$\.[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?)(\.[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\])?)*$/.test(p);
}

function writeJsonPathValue(body: Record<string, unknown>, jsonPath: string, value: unknown): void {
  const raw = String(jsonPath || "").trim();
  const dotPath = raw.startsWith("$.") ? raw.slice(2) : raw.startsWith("$") ? raw.slice(1) : raw;
  if (!dotPath) return;
  const segments = dotPath.split(".").map((s) => s.replace(/\[0\]/g, "")).filter(Boolean);
  if (segments.length === 0) return;
  let cur: any = body;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!cur[seg] || typeof cur[seg] !== "object" || Array.isArray(cur[seg])) cur[seg] = {};
    cur = cur[seg];
  }
  cur[segments[segments.length - 1]] = value;
}

function extractConstraintsFromPattern(pattern: Record<string, unknown>): BodyConstraint[] {
  const out: BodyConstraint[] = [];
  const matchPath = String((pattern as any).matchesJsonPath || "").trim();
  if (matchPath) {
    const enforce = isSimpleJsonPath(matchPath);
    if ((pattern as any).equalTo !== undefined) {
      out.push({ path: matchPath, value: (pattern as any).equalTo, hasValue: true, enforce });
    } else {
      out.push({ path: matchPath, hasValue: false, enforce });
    }
  }

  const rawEqJson = (pattern as any).equalToJson;
  let eqJson: any = null;
  if (rawEqJson && typeof rawEqJson === "object") eqJson = rawEqJson;
  if (typeof rawEqJson === "string") {
    try {
      eqJson = JSON.parse(rawEqJson);
    } catch {
      eqJson = null;
    }
  }
  if (eqJson && typeof eqJson === "object" && !Array.isArray(eqJson)) {
    for (const [k, v] of Object.entries(eqJson)) {
      if (typeof v === "string" && v.includes("${json-unit.any-string}")) continue;
      out.push({ path: `$.${k}`, value: v, hasValue: true, enforce: true });
    }
  }
  return out;
}

function buildMockMatchers(mocks: Array<Record<string, unknown>>): MockMatcher[] {
  const out: MockMatcher[] = [];
  for (const m of mocks) {
    const req = (m as any).request;
    const res = (m as any).response;
    if (!req || typeof req !== "object" || !res || typeof res !== "object") continue;
    const method = normalizeMethod((req as any).method);
    const path = normalizePath(
      (req as any).urlPath ??
      (req as any).url ??
      (req as any).urlPathPattern ??
      (req as any).urlPattern ??
      "/"
    );
    const status = Number((res as any).status ?? 200);
    const bodyPatterns = Array.isArray((req as any).bodyPatterns) ? ((req as any).bodyPatterns as Array<any>) : [];
    const constraints: BodyConstraint[] = [];
    for (const p of bodyPatterns) {
      if (!p || typeof p !== "object") continue;
      constraints.push(...extractConstraintsFromPattern(p as Record<string, unknown>));
    }
    out.push({ method, path, status: Number.isFinite(status) ? status : 200, constraints });
  }
  return out;
}

function isFailureLikeByStatus(status: number): boolean {
  return Number.isFinite(status) && status >= 400;
}

function scenarioPrefersFailure(scenario: Record<string, unknown>): boolean {
  return isFailureScenario(scenario) && !isSuccessScenario(scenario);
}

function matchConstraints(body: unknown, constraints: BodyConstraint[]): boolean {
  const enforced = constraints.filter((c) => c.enforce);
  if (!enforced.length) return true;
  if (!body || typeof body !== "object") return false;
  for (const c of enforced) {
    const got = readJsonPathValue(body as any, c.path);
    if (c.hasValue) {
      if (got !== c.value) return false;
    } else if (got === undefined) {
      return false;
    }
  }
  return true;
}

function chooseMatcherForStep(
  candidates: MockMatcher[],
  scenario: Record<string, unknown>,
  req: Record<string, unknown>
): MockMatcher | null {
  if (candidates.length === 0) return null;
  const expectedRaw = String((req as any).expectedStatus ?? "").toLowerCase();
  if (expectedRaw.includes("4xx")) {
    const list = candidates.filter((c) => isFailureLikeByStatus(c.status));
    if (list.length > 0) return list[0];
  }
  if (expectedRaw.includes("2xx")) {
    const list = candidates.filter((c) => !isFailureLikeByStatus(c.status));
    if (list.length > 0) return list[0];
  }
  if (scenarioPrefersFailure(scenario)) {
    const list = candidates.filter((c) => isFailureLikeByStatus(c.status));
    if (list.length > 0) return list[0];
  }
  const success = candidates.filter((c) => !isFailureLikeByStatus(c.status));
  return (success[0] || candidates[0]) ?? null;
}

function cloneJson<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

function filterCandidatesForScenario(
  candidates: MockMatcher[],
  scenario: Record<string, unknown>,
  req: Record<string, unknown>
): MockMatcher[] {
  const expectedRaw = String((req as any).expectedStatus ?? "").toLowerCase();
  if (expectedRaw.includes("4xx")) {
    const list = candidates.filter((c) => isFailureLikeByStatus(c.status));
    if (list.length > 0) return list;
  }
  if (expectedRaw.includes("2xx")) {
    const list = candidates.filter((c) => !isFailureLikeByStatus(c.status));
    if (list.length > 0) return list;
  }
  if (scenarioPrefersFailure(scenario)) {
    const list = candidates.filter((c) => isFailureLikeByStatus(c.status));
    if (list.length > 0) return list;
  }
  const success = candidates.filter((c) => !isFailureLikeByStatus(c.status));
  return success.length > 0 ? success : candidates;
}

function repairStepAgainstWiremockMatcher(
  scenario: Record<string, unknown>,
  req: Record<string, unknown>,
  matchers: MockMatcher[]
): { repaired: number; compatible: boolean; reason?: string } {
  const method = normalizeMethod((req as any).method);
  const path = normalizePath((req as any).url || "/");
  const candidates = matchers.filter((m) => m.method === method && m.path === path);
  if (candidates.length === 0) return { repaired: 0, compatible: true };
  const expectedRaw = String((req as any).expectedStatus ?? (req as any).expectedStatusCode ?? "").trim().toLowerCase();
  const expectedNum = Number(expectedRaw);
  const expectSuccess = expectedRaw.includes("2xx") || (Number.isFinite(expectedNum) && expectedNum > 0 && expectedNum < 400);
  const expectFailure = expectedRaw.includes("4xx") || expectedRaw.includes("5xx") || (Number.isFinite(expectedNum) && expectedNum >= 400);
  const successCandidates = candidates.filter((m) => !isFailureLikeByStatus(m.status));
  const failureCandidates = candidates.filter((m) => isFailureLikeByStatus(m.status));
  if (expectSuccess && successCandidates.length === 0) {
    return { repaired: 0, compatible: false, reason: "expected success (2xx) but no success matcher exists for this endpoint" };
  }
  if (expectFailure && failureCandidates.length === 0) {
    return { repaired: 0, compatible: false, reason: "expected failure (4xx/5xx) but no failure matcher exists for this endpoint" };
  }
  const pool = filterCandidatesForScenario(candidates, scenario, req);
  if (pool.length === 0) {
    return { repaired: 0, compatible: false, reason: "no matcher candidates available after status-intent filtering" };
  }

  let body = readRequestBodyFromReq(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    body = {};
    writeRequestBodyToReq(req, body);
  }
  const obj = body as Record<string, unknown>;

  for (const c of pool) {
    if (matchConstraints(obj, c.constraints)) return { repaired: 0, compatible: true };
  }

  let best: { body: Record<string, unknown>; repaired: number; constraints: BodyConstraint[] } | null = null;
  for (const cand of pool) {
    const draft = cloneJson(obj);
    let repaired = 0;
    for (const c of cand.constraints) {
      if (!c.enforce) continue;
      const got = readJsonPathValue(draft, c.path);
      if (c.hasValue) {
        if (got === c.value) continue;
        // Force-align discriminator/body matcher values to stub contract.
        writeJsonPathValue(draft, c.path, c.value);
        repaired++;
        continue;
      }
      // For required presence-only constraints, inject a safe placeholder.
      if (got === undefined) {
        writeJsonPathValue(draft, c.path, "sample");
        repaired++;
      }
    }
    if (matchConstraints(draft, cand.constraints)) {
      if (!best || repaired < best.repaired) best = { body: draft, repaired, constraints: cand.constraints };
    }
  }

  if (best) {
    writeRequestBodyToReq(req, best.body);
    return { repaired: best.repaired, compatible: true };
  }

  const chosen = chooseMatcherForStep(pool, scenario, req) || pool[0];
  if (!chosen) return { repaired: 0, compatible: true };
  const enforced = chosen.constraints.filter((c) => c.enforce);
  if (enforced.length === 0) return { repaired: 0, compatible: true };

  const unmet: string[] = [];
  for (const c of enforced) {
    const got = readJsonPathValue(obj, c.path);
    if (c.hasValue && got !== c.value) unmet.push(`${c.path}=${String(c.value)}`);
    if (!c.hasValue && got === undefined) unmet.push(`${c.path} (required)`);
  }
  return { repaired: 0, compatible: false, reason: `unmet matcher constraints: ${unmet.join(", ")}` };
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

function normalizeMethod(raw: unknown): string {
  const m = String(raw ?? "").trim().toUpperCase();
  return m || "POST";
}

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as Record<string, unknown>).length > 0;
}

function readRequestBodyFromReq(req: Record<string, unknown>): unknown {
  const direct = (req as any).requestBody ?? (req as any).jsonBody ?? (req as any).body ?? (req as any).payload;
  if (direct == null) return null;
  if (typeof direct === "string") {
    const t = direct.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  }
  return direct;
}

function writeRequestBodyToReq(req: Record<string, unknown>, body: unknown): void {
  if (body == null) return;
  (req as any).requestBody = body;
  if ((req as any).jsonBody === undefined) (req as any).jsonBody = body;
}

function repairApiAssertStepsInScenario(scenario: Record<string, unknown>): number {
  const steps = Array.isArray((scenario as any).steps) ? ((scenario as any).steps as Array<any>) : [];
  if (steps.length === 0) return 0;
  let repaired = 0;
  const latestBodyByKey = new Map<string, unknown>();

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const type = String((step as any).type || "").trim();
    const req = (step as any).request;
    if (!req || typeof req !== "object") continue;

    const method = normalizeMethod((req as any).method);
    const path = normalizePath((req as any).url || "/");
    const key = `${method} ${path}`;
    const body = readRequestBodyFromReq(req as Record<string, unknown>);

    if (type === "api-call" && body != null && (!(typeof body === "object") || isNonEmptyObject(body))) {
      latestBodyByKey.set(key, body);
      continue;
    }

    if (type !== "api-assert") continue;

    const hasBody = body != null && (!(typeof body === "object") || isNonEmptyObject(body));
    if (!hasBody) {
      const fallback = latestBodyByKey.get(key);
      if (fallback != null) {
        writeRequestBodyToReq(req as Record<string, unknown>, fallback);
        repaired++;
      }
    }

    if ((req as any).expectedStatus === undefined && (req as any)._flowtestMockStatus !== undefined) {
      (req as any).expectedStatus = (req as any)._flowtestMockStatus;
    }
  }
  return repaired;
}

function sampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const t = String(schema.type || "");
  if (t === "string") return "sample";
  if (t === "number" || t === "integer") return 0;
  if (t === "boolean") return true;
  if (t === "array") return [sampleFromSchema(schema.items)];
  if (t === "object" || schema.properties) {
    const out: Record<string, unknown> = {};
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const [k, v] of Object.entries(props)) out[k] = sampleFromSchema(v);
    return out;
  }
  return null;
}

function buildApiRequestSamples(apiSpecValue: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const apis = Array.isArray((apiSpecValue as any)?.apis) ? ((apiSpecValue as any).apis as Array<any>) : [];
  for (const api of apis) {
    if (!api || typeof api !== "object") continue;
    const method = normalizeMethod(api.method);
    const path = normalizePath(api.path || "/");
    const key = `${method} ${path}`;
    const reqSchema =
      (api.request && typeof api.request === "object" ? api.request : null) ||
      (api.requestSchema && typeof api.requestSchema === "object" ? api.requestSchema : null);
    if (!reqSchema) continue;
    const sample = sampleFromSchema(reqSchema);
    if (sample != null) out.set(key, sample);
  }
  return out;
}

function ensureJsonHeader(req: Record<string, unknown>): boolean {
  const rawHeaders = (req as any).headers;
  const headers: Record<string, unknown> =
    rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, unknown>)
      : {};
  const had = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
  if (!had) {
    headers["Content-Type"] = "application/json";
    (req as any).headers = headers;
    return true;
  }
  return false;
}

function sanitizeScenarioSteps(
  scenario: Record<string, unknown>,
  apiSamples: Map<string, unknown>,
  mockMatchers: MockMatcher[]
): { repairedBodies: number; addedHeaders: number; addedExpectedStatuses: number; matcherRepairs: number; matcherErrors: string[] } {
  const steps = Array.isArray((scenario as any).steps) ? ((scenario as any).steps as Array<any>) : [];
  const failLike = isFailureScenario(scenario);
  const seenBodies = new Map<string, unknown>();
  let repairedBodies = 0;
  let addedHeaders = 0;
  let addedExpectedStatuses = 0;
  let matcherRepairs = 0;
  const matcherErrors: string[] = [];
  const sid = String((scenario as any).scenarioId || "unknown-scenario");

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const type = String((step as any).type || "");
    if (type !== "api-call" && type !== "api-assert") continue;
    const req = ((step as any).request && typeof (step as any).request === "object")
      ? ((step as any).request as Record<string, unknown>)
      : ({} as Record<string, unknown>);
    (step as any).request = req;

    const method = normalizeMethod((req as any).method);
    const path = normalizePath((req as any).url || "/");
    (req as any).method = method;
    (req as any).url = path;
    const key = `${method} ${path}`;

    let body = readRequestBodyFromReq(req);
    if (body == null || (typeof body === "object" && !Array.isArray(body) && !isNonEmptyObject(body))) {
      const fallback = seenBodies.get(key) ?? apiSamples.get(key) ?? null;
      if (fallback != null) {
        writeRequestBodyToReq(req, fallback);
        body = fallback;
        repairedBodies++;
      }
    }
    if (body != null && (!(typeof body === "object") || isNonEmptyObject(body))) {
      seenBodies.set(key, body);
      if (ensureJsonHeader(req)) addedHeaders++;
    }

    const hasExpected = (req as any).expectedStatus !== undefined
      || (req as any).expectedStatusCode !== undefined
      || (req as any).expectedStatuses !== undefined;
    if (!hasExpected) {
      (req as any).expectedStatus = failLike ? "4xx" : "2xx";
      addedExpectedStatuses++;
    }

    const matcherFix = repairStepAgainstWiremockMatcher(scenario, req, mockMatchers);
    matcherRepairs += matcherFix.repaired;
    if (!matcherFix.compatible) {
      matcherErrors.push(`${sid} ${type} ${method} ${path}: ${String(matcherFix.reason || "matcher not compatible")}`);
    }
  }

  repairedBodies += repairApiAssertStepsInScenario(scenario);
  return { repairedBodies, addedHeaders, addedExpectedStatuses, matcherRepairs, matcherErrors };
}

export async function runIntakePromptChain(
  intake: StartIntakePayload,
  onProgress?: IntakeProgressHandler
): Promise<IntakeChainResult> {
  const scenarioMode = resolveScenarioMode(intake);
  const scenarioProfile = getScenarioProfile(scenarioMode);
  const llmTimeoutMs = scenarioProfile.scenarioTimeoutMs;
  const llmMaxRetries = Math.max(2, getAiMaxRetries());
  const docsText = buildDocsText(intake);
  const addon = additionalInfoAddon(intake);
  const provider = getProvider();
  const model = getModel(provider);
  const llmEndpoint = getEndpoint(provider);

  const buildDispatchAction = (taskType: AiTaskType, prompt: string) => ({
    label: "AI Request",
    title: `${taskType} - AI Request`,
    content: JSON.stringify(
      {
        provider,
        model,
        llm_endpoint: llmEndpoint,
        taskType,
        requestPayload: {
          model,
          messages: [
            { role: "system", content: buildSystemPrompt(taskType) },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
        }
      },
      null,
      2
    )
  });

  const apiSpecPrompt =
    [
      "Generate normalized API spec JSON from these docs.",
      "",
      "STRICT OUTPUT FORMAT (JSON only, no markdown):",
      "{",
      '  "project": "string",',
      '  "version": "1.0.0",',
      '  "basePath": "/",',
      '  "apis": [',
      "    {",
      '      "apiId": "string",',
      '      "name": "string",',
      '      "method": "POST",',
      '      "path": "/example/path",',
      '      "purpose": "string",',
      '      "request": { "type": "object", "properties": {}, "required": [] },',
      '      "responses": [',
      "        {",
      '          "name": "SUCCESS",',
      '          "httpStatus": 200,',
      '          "body": { "type": "object", "properties": {}, "required": [] },',
      '          "sample": {}',
      "        },",
      "        {",
      '          "name": "FAILURE_CODE",',
      '          "httpStatus": 400,',
      '          "body": { "type": "object", "properties": {}, "required": [] },',
      '          "sample": {}',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}",
      "",
      "MANDATORY RULES:",
      "1) Every API MUST include request schema under request.",
      "2) Every API MUST include at least one success response (2xx) and one failure response (4xx or 5xx).",
      "3) Every response MUST include both body schema and sample example.",
      "4) Response samples MUST be realistic and consistent with docs.",
      "5) For endpoint names/paths/statuses/examples, prioritize SUCCESS and FAILURE sample docs first.",
      "6) Do not omit failure variants if available in docs.",
      "7) Do not wrap output in backticks.",
      "",
      "Use only information inferable from the provided docs. Do not invent unrelated APIs.",
      "",
      docsText + addon
    ].join("\n");
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
      called_at: apiSpecStartedAt,
      timeout_ms: llmTimeoutMs,
      max_retries: llmMaxRetries
    },
    actions: [buildDispatchAction("GENERATE_API_SPEC", apiSpecPrompt)]
  });
  const apiSpec = await executeAiTaskDetailed("GENERATE_API_SPEC", apiSpecPrompt, {
    timeoutMs: llmTimeoutMs,
    maxRetries: llmMaxRetries
  });
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

  const wiremockPrompt =
    [
      "Generate production-grade WireMock mappings from this API spec.",
      "",
      "STRICT OUTPUT (JSON only, no markdown):",
      "{",
      '  "mappings": [',
      "    {",
      '      "id": "string",',
      '      "name": "string",',
      '      "priority": 10,',
      '      "request": {',
      '        "method": "POST",',
      '        "urlPath": "/example/path",',
      '        "headers": { "Content-Type": { "equalTo": "application/json" } },',
      '        "bodyPatterns": [',
      '          { "matchesJsonPath": "$.field" },',
      '          { "matchesJsonPath": "$.type", "equalTo": "SUCCESS_OR_FAILURE_DISCRIMINATOR" }',
      "        ]",
      "      },",
      '      "response": {',
      '        "status": 200,',
      '        "headers": { "Content-Type": "application/json" },',
      '        "jsonBody": {}',
      "      }",
      "    }",
      "  ]",
      "}",
      "",
      "MANDATORY RULES:",
      "1) For EVERY API, generate at least one success mapping and one failure mapping.",
      "2) Failure mappings MUST include realistic 4xx/5xx status and error payload from docs.",
      "3) Use strong request discriminators via bodyPatterns/headers so success and failure are both testable.",
      "4) Set explicit priority: specific failure stubs should have higher precedence (lower number) than generic success stubs.",
      "5) Do not create duplicate ambiguous mappings with same matcher set.",
      "6) Keep URL/method exactly aligned with API spec.",
      "7) Return only JSON, no explanation.",
      "",
      "API SPEC INPUT:",
      apiSpec.responseText + addon
    ].join("\n");
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
      called_at: wiremockStartedAt,
      timeout_ms: llmTimeoutMs,
      max_retries: llmMaxRetries
    },
    actions: [buildDispatchAction("GENERATE_MOCKS", wiremockPrompt)]
  });
  const wiremock = await executeAiTaskDetailed("GENERATE_MOCKS", wiremockPrompt, {
    timeoutMs: llmTimeoutMs,
    maxRetries: llmMaxRetries
  });
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
    "2) Top-level keys MUST be: dslVersion, flowName, scenarios.",
    "3) scenarios MUST be an array with comprehensive scenario set.",
    "4) Each scenario MUST include: scenarioId, name, tags, steps.",
    "5) steps MUST be an array of objects with: id, type, request.",
    "6) type MUST be one of: api-call, api-assert, log, set-context, sleep.",
    "7) For api-call/api-assert each step request MUST include method and url.",
    "8) Scenario set MUST include: 1 happy path + multiple negative/edge paths based on failure docs.",
    `9) FOR EACH API endpoint in the API spec, create ${scenarioProfile.minPerApi} to ${scenarioProfile.maxPerApi} scenarios that cover that endpoint across success and failure conditions.`,
    "10) Ensure every API has at least one success and one failure scenario.",
    `11) Target distribution per API: about ${scenarioProfile.successPerApiHint} success and ${scenarioProfile.failurePerApiHint} failure scenarios.`,
    "12) Reuse realistic payload variations from samples so failures are triggerable.",
    "13) Keep request/response expectations deterministic and testable."
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
  const parseOrRepairScenarioSuite = async (rawText: string, contextLabel: string): Promise<Array<Record<string, unknown>>> => {
    let parsedValue = extractJsonValue(rawText);
    let suite = normalizeScenarioSuite(parsedValue);
    if (suite.length > 0) return suite;

    await onProgress?.({
      stage: "Scenario DSL",
      status: "warn",
      title: "Json Repair Attempt",
      detail: `${contextLabel}: repairing non-JSON scenario output`
    });
    const repairPrompt = [
      "Convert the following content into strict JSON only.",
      "Return exactly one JSON object with keys: dslVersion, flowName, scenarios.",
      "scenarios must be an array of scenario objects with scenarioId, name, tags, steps.",
      "Each step must include id, type, request; for api-call/api-assert include request.method and request.url.",
      "Do not include markdown or comments.",
      "",
      "CONTENT TO REPAIR:",
      rawText
    ].join("\n");
    const repaired = await executeAiTaskDetailed("GENERATE_SCENARIO", repairPrompt, {
      timeoutMs: llmTimeoutMs,
      maxRetries: llmMaxRetries
    });
    parsedValue = extractJsonValue(String(repaired.responseText || ""));
    suite = normalizeScenarioSuite(parsedValue);
    await onProgress?.({
      stage: "Scenario DSL",
      status: suite.length > 0 ? "success" : "error",
      title: suite.length > 0 ? "Json Repair Succeeded" : "Json Repair Failed",
      detail: suite.length > 0 ? `${contextLabel}: scenarios=${suite.length}` : `${contextLabel}: could not recover valid JSON`
    });
    return suite;
  };

  const apiSpecParsedForScenarios = extractJsonValue(apiSpec.responseText);
  const apiList = Array.isArray((apiSpecParsedForScenarios as any)?.apis)
    ? ((apiSpecParsedForScenarios as any).apis as Array<Record<string, unknown>>)
    : [];
  const apisPerCall = scenarioProfile.apisPerCall;
  const useChunkedScenarioDsl = scenarioProfile.mode === "extensive";

  await onProgress?.({
    stage: "Scenario DSL",
    status: "info",
    title: "Api Inventory",
    detail: `api_count=${apiList.length} mode=${scenarioProfile.mode} strategy=${useChunkedScenarioDsl ? "chunked" : "single"} apis_per_call=${apisPerCall}`,
    meta: {
      api_count: apiList.length,
      scenario_mode: scenarioProfile.mode,
      strategy: useChunkedScenarioDsl ? "chunked" : "single",
      apis_per_call: apisPerCall,
      scenarios_per_api_min: scenarioProfile.minPerApi,
      scenarios_per_api_max: scenarioProfile.maxPerApi
    }
  });

  let scenario = await executeAiTaskDetailed("GENERATE_SCENARIO", scenarioPrompt, {
    timeoutMs: llmTimeoutMs,
    maxRetries: llmMaxRetries
  });
  let scenariosJson: Array<Record<string, unknown>> = [];
  let scenarioRawText = "";

  if (apiList.length > 0 && useChunkedScenarioDsl) {
    const merged: Array<Record<string, unknown>> = [];
    let fallbackTrace: typeof scenario | null = null;
    const apiChunks: Array<Array<Record<string, unknown>>> = [];
    for (let i = 0; i < apiList.length; i += apisPerCall) {
      apiChunks.push(apiList.slice(i, i + apisPerCall));
    }
    for (let i = 0; i < apiChunks.length; i++) {
      const chunk = apiChunks[i] || [];
      const endpointLabel = chunk
        .map((a) => `${String((a as any).method || "POST").toUpperCase()} ${String((a as any).path || "/")}`)
        .join(" | ");
      const perApiPrompt = [
        "Generate FlowTest DSL scenarios for a subset of API endpoints.",
        "",
        strictSchemaHint,
        "13) Generate scenarios ONLY for the endpoint list below.",
        `14) For EACH listed endpoint, generate ${scenarioProfile.minPerApi}-${scenarioProfile.maxPerApi} scenarios with at least one success and one failure.`,
        "",
        "FULL API UNDERSTANDING:",
        String(apiSpec.responseText || ""),
        "",
        "TARGET API NODES:",
        JSON.stringify(chunk, null, 2),
        "",
        "WIREMOCK PLAN:",
        String(wiremock.responseText || ""),
        addon
      ].join("\n");

      await onProgress?.({
        stage: "Scenario DSL",
        status: "running",
        title: "Ai Request Dispatched",
        detail: `task=GENERATE_SCENARIO chunk=${i + 1}/${apiChunks.length}`,
        meta: {
          task: "GENERATE_SCENARIO",
          provider,
          model,
          chunk_index: i + 1,
          chunk_total: apiChunks.length,
          chunk_api_count: chunk.length,
          endpoints: endpointLabel,
          called_at: new Date().toISOString(),
          timeout_ms: llmTimeoutMs,
          max_retries: llmMaxRetries
        },
        actions: [buildDispatchAction("GENERATE_SCENARIO", perApiPrompt)]
      });

      const perApiScenario = await executeAiTaskDetailed("GENERATE_SCENARIO", perApiPrompt, {
        timeoutMs: llmTimeoutMs,
        maxRetries: llmMaxRetries
      });
      fallbackTrace = perApiScenario;
      await onProgress?.({
        stage: "Scenario DSL",
        status: "success",
        title: "Ai Response Received",
        detail: `chunk=${i + 1}/${apiChunks.length} ${String(perApiScenario.responseText || "").length} chars`,
        meta: {
          provider: perApiScenario.provider,
          model: perApiScenario.model,
          called_at: perApiScenario.calledAt,
          completed_at: perApiScenario.completedAt,
          duration_ms: perApiScenario.durationMs,
          chunk_index: i + 1,
          chunk_total: apiChunks.length,
          chunk_api_count: chunk.length,
          endpoints: endpointLabel
        },
        actions: [
          { label: "AI Request", title: `Scenario DSL - AI Request (chunk ${i + 1})`, content: JSON.stringify(perApiScenario.requestPayload, null, 2) },
          { label: "AI Response", title: `Scenario DSL - AI Response (chunk ${i + 1})`, content: String(perApiScenario.responseText || "") }
        ]
      });

      const oneSuite = await parseOrRepairScenarioSuite(String(perApiScenario.responseText || ""), `chunk ${i + 1}`);
      merged.push(...oneSuite);
    }

    const seen = new Set<string>();
    scenariosJson = merged.filter((s, i) => {
      const sid = String((s as any).scenarioId || `scenario-${i + 1}`);
      if (seen.has(sid)) return false;
      seen.add(sid);
      return true;
    });
    scenarioRawText = JSON.stringify(
      { dslVersion: "1.0", flowName: String(intake.runName || "flowtest"), scenarios: scenariosJson },
      null,
      2
    );
    if (fallbackTrace) scenario = fallbackTrace;
  } else {
    await onProgress?.({
      stage: "Scenario DSL",
      status: "running",
      title: "Ai Request Dispatched",
      detail: "task=GENERATE_SCENARIO",
      meta: {
        task: "GENERATE_SCENARIO",
        provider,
        model,
        called_at: new Date().toISOString(),
        timeout_ms: llmTimeoutMs,
        max_retries: llmMaxRetries
      },
      actions: [buildDispatchAction("GENERATE_SCENARIO", scenarioPrompt)]
    });
    scenario = await executeAiTaskDetailed("GENERATE_SCENARIO", scenarioPrompt, {
      timeoutMs: llmTimeoutMs,
      maxRetries: llmMaxRetries
    });
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
    scenarioRawText = String(scenario.responseText || "");
    scenariosJson = await parseOrRepairScenarioSuite(scenarioRawText, "combined");
  }
  let scenarioJson = scenariosJson.length > 0 ? scenariosJson[0] : null;
  const wiremockJson = extractJsonValue(wiremock.responseText);
  const normalizedMocks = normalizeWiremockMocks(wiremockJson);
  const effectiveMocks = normalizedMocks;
  let attachedMockCount = 0;
  let mockCoverageOk = false;
  let preflightError: string | null = null;
  let apiCoverageMatrix: Array<Record<string, unknown>> = [];
  let coverageError: string | null = null;

  if (!scenarioJson || scenariosJson.length === 0) {
    preflightError = "Scenario output was not valid JSON";
    await onProgress?.({
      stage: "Scenario DSL",
      status: "error",
      title: "Json Parse Failed",
      detail: preflightError
    });
  } else {
    const apiSpecParsed = extractJsonValue(apiSpec.responseText);
    const apiRequestSamples = buildApiRequestSamples(apiSpecParsed);
    const mockMatchers = buildMockMatchers(effectiveMocks);
    let repairedBodies = 0;
    let addedHeaders = 0;
    let addedExpectedStatuses = 0;
    let matcherRepairs = 0;
    let matcherErrorsAll: string[] = [];

    const runSanitizerPass = () => {
      repairedBodies = 0;
      addedHeaders = 0;
      addedExpectedStatuses = 0;
      matcherRepairs = 0;
      matcherErrorsAll = [];
      for (const sc of scenariosJson) {
        const fixed = sanitizeScenarioSteps(sc, apiRequestSamples, mockMatchers);
        repairedBodies += fixed.repairedBodies;
        addedHeaders += fixed.addedHeaders;
        addedExpectedStatuses += fixed.addedExpectedStatuses;
        matcherRepairs += fixed.matcherRepairs;
        matcherErrorsAll.push(...fixed.matcherErrors);
      }
    };

    runSanitizerPass();

    const maxMatcherRetries = 2;
    for (let attempt = 1; attempt <= maxMatcherRetries && matcherErrorsAll.length > 0; attempt++) {
      const retryPrompt =
        [
          "You generated FlowTest scenarios that failed WireMock matcher compatibility.",
          "Fix ONLY scenario request bodies/steps so they match the wiremock request matchers exactly.",
          "Return JSON only in suite format:",
          '{ "dslVersion":"1.0", "flowName":"...", "scenarios":[ ... ] }',
          "",
          "WHAT YOU DID WRONG:",
          ...matcherErrorsAll.slice(0, 50),
          "",
          "WHAT WE NEED NOW (STRICT):",
          "1) For every api-call/api-assert step, request.method and request.url must match API + wiremock endpoint.",
          "2) request.requestBody must include all matcher discriminator fields required by wiremock bodyPatterns.",
          "3) If wiremock expects exact value, scenario must use that exact value.",
          "4) Ensure api-assert requestBody is not empty and is compatible with selected matcher.",
          "5) Keep scenario intent (success/failure) but prioritize compatibility correctness.",
          "6) Do not include markdown or backticks.",
          "",
          "API SPEC:",
          String(apiSpec.responseText || ""),
          "",
          "WIREMOCK MAPPINGS:",
          String(wiremock.responseText || ""),
          "",
          "CURRENT SCENARIOS TO FIX:",
          JSON.stringify({ dslVersion: "1.0", flowName: String(intake.runName || "flowtest"), scenarios: scenariosJson }, null, 2)
        ].join("\n");

      await onProgress?.({
        stage: "Scenario DSL",
        status: "warn",
        title: "Matcher Retry",
        detail: `attempt=${attempt}/${maxMatcherRetries} fixing ${matcherErrorsAll.length} compatibility issue(s)`,
        meta: {
          attempt,
          max_attempts: maxMatcherRetries,
          matcher_errors: matcherErrorsAll.length
        },
        actions: [buildDispatchAction("GENERATE_SCENARIO", retryPrompt)]
      });

      const retry = await executeAiTaskDetailed("GENERATE_SCENARIO", retryPrompt, {
        timeoutMs: llmTimeoutMs,
        maxRetries: llmMaxRetries
      });
      await onProgress?.({
        stage: "Scenario DSL",
        status: "info",
        title: "Matcher Retry Response",
        detail: `${String(retry.responseText || "").length} chars`,
        meta: {
          provider: retry.provider,
          model: retry.model,
          called_at: retry.calledAt,
          completed_at: retry.completedAt,
          duration_ms: retry.durationMs
        },
        actions: [
          { label: "AI Request", title: `Matcher Retry ${attempt} - AI Request`, content: JSON.stringify(retry.requestPayload, null, 2) },
          { label: "AI Response", title: `Matcher Retry ${attempt} - AI Response`, content: String(retry.responseText || "") }
        ]
      });

      const retryScenarios = normalizeScenarioSuite(extractJsonValue(retry.responseText));
      if (retryScenarios.length === 0) break;
      scenariosJson = retryScenarios;
      scenarioJson = scenariosJson[0] || null;
      runSanitizerPass();
    }

    await onProgress?.({
      stage: "Scenario DSL",
      status: "info",
      title: "Step Sanitizer",
      detail: `repaired_bodies=${repairedBodies} added_headers=${addedHeaders} added_expected_status=${addedExpectedStatuses} matcher_repairs=${matcherRepairs}`,
      meta: {
        repaired_bodies: repairedBodies,
        added_headers: addedHeaders,
        added_expected_status: addedExpectedStatuses,
        matcher_repairs: matcherRepairs,
        matcher_errors: matcherErrorsAll.length
      }
    });
    if (matcherErrorsAll.length > 0) {
      preflightError = `Scenario/WireMock compatibility failed for ${matcherErrorsAll.length} step(s).`;
      await onProgress?.({
        stage: "Scenario DSL",
        status: "error",
        title: "Matcher Compatibility Failed",
        detail: preflightError,
        meta: {
          matcher_errors: matcherErrorsAll.length
        },
        actions: [
          {
            label: "Compatibility Errors",
            title: "Scenario to WireMock Matcher Compatibility Errors",
            content: JSON.stringify(matcherErrorsAll, null, 2)
          }
        ]
      });
    }

    const coverageIssuesText = (c: ReturnType<typeof computeApiCoverageMatrix>): string => {
      const issues: string[] = [];
      if (c.missingFailure.length > 0) issues.push(`APIs missing failure coverage: ${c.missingFailure.join(", ")}`);
      if (c.missingSuccess.length > 0) issues.push(`APIs missing success coverage: ${c.missingSuccess.join(", ")}`);
      if (c.outOfRange.length > 0) {
        issues.push(`APIs outside ${scenarioProfile.minPerApi}-${scenarioProfile.maxPerApi} scenario range: ${c.outOfRange.join(", ")}`);
      }
      return issues.join(" | ");
    };

    // Try to improve scenario coverage automatically, but do not hard-fail if still below target.
    const maxCoverageRetries = 2;
    let coverage = computeApiCoverageMatrix(apiSpecParsed, scenariosJson, scenarioProfile.minPerApi, scenarioProfile.maxPerApi);
    for (let attempt = 1; attempt <= maxCoverageRetries; attempt++) {
      const issuesText = coverageIssuesText(coverage);
      if (!issuesText) break;

      await onProgress?.({
        stage: "Scenario DSL",
        status: "warn",
        title: "Coverage Retry",
        detail: `attempt=${attempt}/${maxCoverageRetries} ${issuesText}`,
        meta: {
          attempt,
          max_attempts: maxCoverageRetries,
          api_count: coverage.matrix.length,
          missing_failure_count: coverage.missingFailure.length,
          missing_success_count: coverage.missingSuccess.length,
          out_of_range_count: coverage.outOfRange.length
        }
      });
      const coverageRetryStart = Date.now();
      await onProgress?.({
        stage: "Scenario DSL",
        status: "running",
        title: "Coverage Retry In Progress",
        detail: `attempt=${attempt}/${maxCoverageRetries} waiting for LLM response`,
        meta: {
          attempt,
          max_attempts: maxCoverageRetries,
          started_at: new Date(coverageRetryStart).toISOString()
        }
      });

      const retryPrompt =
        [
          "Regenerate FlowTest scenario suite JSON only.",
          "Keep output format: { dslVersion, flowName, scenarios: [] }.",
          `Goal: improve API coverage for each endpoint with ${scenarioProfile.minPerApi}-${scenarioProfile.maxPerApi} scenarios per API, including success and failure.`,
          "Do not include markdown.",
          "",
          "API SPEC:",
          String(apiSpec.responseText || ""),
          "",
          "WIREMOCK MAPPINGS:",
          String(wiremock.responseText || ""),
          "",
          "CURRENT SCENARIOS (improve this):",
          JSON.stringify({ dslVersion: "1.0", flowName: String(intake.runName || "flowtest"), scenarios: scenariosJson }, null, 2),
          "",
          "COVERAGE GAPS TO FIX:",
          issuesText
        ].join("\n");

      const retry = await executeAiTaskDetailed("GENERATE_SCENARIO", retryPrompt, {
        timeoutMs: llmTimeoutMs,
        maxRetries: llmMaxRetries
      });
      const coverageRetryDurationMs = Date.now() - coverageRetryStart;
      await onProgress?.({
        stage: "Scenario DSL",
        status: "success",
        title: "Coverage Retry Completed",
        detail: `attempt=${attempt}/${maxCoverageRetries} duration=${Math.max(1, Math.round(coverageRetryDurationMs / 100) / 10)}s`,
        meta: {
          attempt,
          max_attempts: maxCoverageRetries,
          provider: retry.provider,
          model: retry.model,
          duration_ms: coverageRetryDurationMs,
          response_chars: String(retry.responseText || "").length
        },
        actions: [
          { label: "AI Request", title: `Coverage Retry ${attempt} - AI Request`, content: JSON.stringify(retry.requestPayload, null, 2) },
          { label: "AI Response", title: `Coverage Retry ${attempt} - AI Response`, content: String(retry.responseText || "") }
        ]
      });
      const retryScenarios = normalizeScenarioSuite(extractJsonValue(retry.responseText));
      if (retryScenarios.length > 0) {
        scenariosJson = retryScenarios;
        scenarioJson = scenariosJson[0] || null;
        coverage = computeApiCoverageMatrix(apiSpecParsed, scenariosJson, scenarioProfile.minPerApi, scenarioProfile.maxPerApi);
      } else {
        break;
      }
    }

    let attachedTotal = 0;
    let coverageMocks = 0;
    let coverageInline = 0;
    for (const sc of scenariosJson) {
      attachedTotal += attachInferredMocksToScenario(sc, effectiveMocks);
      const m = countScenarioMockCoverage(sc);
      coverageMocks += m.mocks;
      coverageInline += m.inline;
    }
    attachedMockCount = attachedTotal;
    mockCoverageOk = coverageMocks > 0 || coverageInline > 0;
    if (!mockCoverageOk) {
      preflightError = "No mocks were extracted/attached. Engine run skipped to avoid live API 404.";
      await onProgress?.({
        stage: "WireMock",
        status: "warn",
        title: "Mocks Parse Empty",
        detail: preflightError,
        meta: {
          wiremock_mocks: effectiveMocks.length,
          attached_mocks: attachedTotal,
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
          attached_mocks: attachedTotal,
          coverage_ok: true
        }
      });
    }

    coverage = computeApiCoverageMatrix(apiSpecParsed, scenariosJson, scenarioProfile.minPerApi, scenarioProfile.maxPerApi);
    apiCoverageMatrix = coverage.matrix;
    const finalCoverageIssues = coverageIssuesText(coverage);
    if (finalCoverageIssues) {
      coverageError = finalCoverageIssues;
      await onProgress?.({
        stage: "Scenario DSL",
        status: "warn",
        title: "Coverage Matrix",
        detail: `Proceeding with available scenarios: ${finalCoverageIssues}`,
        meta: {
          api_count: coverage.matrix.length,
          missing_failure_count: coverage.missingFailure.length,
          missing_success_count: coverage.missingSuccess.length,
          out_of_range_count: coverage.outOfRange.length
        },
        actions: [
          {
            label: "Coverage Matrix",
            title: "API Coverage Matrix",
            content: JSON.stringify(coverage.matrix, null, 2)
          }
        ]
      });
    } else {
      await onProgress?.({
        stage: "Scenario DSL",
        status: "success",
        title: "Coverage Matrix",
        detail: `api_count=${coverage.matrix.length} all APIs have success+failure and ${scenarioProfile.minPerApi}-${scenarioProfile.maxPerApi} scenarios`,
        meta: { api_count: coverage.matrix.length },
        actions: [
          {
            label: "Coverage Matrix",
            title: "API Coverage Matrix",
            content: JSON.stringify(coverage.matrix, null, 2)
          }
        ]
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
      scenariosJson,
      apiCoverageMatrix,
      coverageError,
      wiremockMockCount: effectiveMocks.length,
      attachedMockCount,
      mockCoverageOk,
      scenarioMode: scenarioProfile.mode,
      preflightError
    }
  };
}
