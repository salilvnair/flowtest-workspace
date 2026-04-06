import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

type RequestExample = {
  method: string;
  path: string;
  requestBody: any;
  status?: number;
  start: number;
  source: string;
  scenarioId?: string;
  stepName?: string;
};

type ResultStep = {
  name?: string;
  attachments?: Array<{ name?: string; source?: string }>;
};

type ResultFile = {
  start?: number;
  name?: string;
  status?: string;
  steps?: ResultStep[];
  parameters?: Array<{ name?: string; value?: string }>;
};

const ALLURE_RESULTS_DIR = path.resolve(process.cwd(), "../flowtest-parent/allure-results");

function requestKey(method: string, urlPath: string): string {
  return `${String(method || "POST").toUpperCase()} ${String(urlPath || "").trim()}`;
}

function parsePathFromUrl(urlValue: string): string {
  const text = String(urlValue || "").trim();
  if (!text) return "";
  if (text.startsWith("/")) return text;
  try {
    const u = new URL(text);
    return u.pathname || "";
  } catch {
    return "";
  }
}

function inferMethodAndPath(stepName: string): { method: string; path: string } {
  const input = String(stepName || "");
  const match = input.match(/\]\s*-\s*([A-Z]+)\s+([^\s]+)/);
  if (!match) return { method: "POST", path: "" };
  return {
    method: String(match[1] || "POST").toUpperCase(),
    path: String(match[2] || "").trim()
  };
}

function dedupeExamples(list: RequestExample[]): RequestExample[] {
  const seen = new Set<string>();
  const out: RequestExample[] = [];
  for (const item of list) {
    const scenario = String(item.scenarioId || "").trim();
    const status = Number(item.status || 0);
    const sig = `${item.method} ${item.path}::scenario=${scenario}::status=${status}::${JSON.stringify(item.requestBody)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

function scenarioIdFromResult(result: ResultFile): string {
  const params = Array.isArray(result?.parameters) ? result.parameters : [];
  for (const p of params) {
    if (String(p?.name || "") === "scenarioId") return String(p?.value || "").trim();
  }
  return "";
}

function makeSummary(example: RequestExample, classIndex: number): string {
  const status = Number(example.status || 0);
  const classLabel = status >= 400 ? "failure" : "success";
  const scenario = String(example.scenarioId || "").trim();
  const body = example.requestBody && typeof example.requestBody === "object" ? example.requestBody : {};
  const intentRaw = body.requestType ?? body.eventType ?? body.action ?? body.type;
  const intent = String(intentRaw || "").trim();
  if (scenario && intent) return `${classLabel}_${classIndex} (${scenario}) [${intent}]`;
  if (scenario) return `${classLabel}_${classIndex} (${scenario})`;
  if (intent) return `${classLabel}_${classIndex} [${intent}]`;
  return `${classLabel}_${classIndex}`;
}

export async function loadLatestRequestExamples(): Promise<Map<string, Array<{ summary: string; value: any }>>> {
  const byEndpoint = new Map<string, RequestExample[]>();
  try {
    const all = await readdir(ALLURE_RESULTS_DIR);
    const resultFiles = all.filter((f) => f.endsWith("-result.json"));
    for (const file of resultFiles) {
      const resultPath = path.join(ALLURE_RESULTS_DIR, file);
      let parsed: ResultFile | null = null;
      try {
        parsed = JSON.parse(await readFile(resultPath, "utf-8")) as ResultFile;
      } catch {
        continue;
      }
      const start = Number(parsed?.start || 0);
      const scenarioId = scenarioIdFromResult(parsed || {});
      const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
      for (const step of steps) {
        const stepName = String(step?.name || "");
        if (!stepName.includes("[api-call]") && !stepName.includes("[api-assert]")) continue;
        const { method: fallbackMethod, path: fallbackPath } = inferMethodAndPath(stepName);
        const attachments = Array.isArray(step?.attachments) ? step.attachments : [];
        const outputAttachment = attachments.find((a) => String(a?.name || "").startsWith("step-output-"));
        const source = String(outputAttachment?.source || "").trim();
        if (!source) continue;
        const attachmentPath = path.join(ALLURE_RESULTS_DIR, source);
        let output: any = null;
        try {
          output = JSON.parse(await readFile(attachmentPath, "utf-8"));
        } catch {
          continue;
        }
        const body = output?.requestBody;
        if (!body || typeof body !== "object") continue;
        const method = String(output?.method || fallbackMethod || "POST").toUpperCase();
        const status = Number(output?.status || 0) || undefined;
        const fromUrl = parsePathFromUrl(String(output?.url || ""));
        const urlPath = String(fromUrl || fallbackPath || "").trim();
        if (!urlPath.startsWith("/")) continue;
        const key = requestKey(method, urlPath);
        const arr = byEndpoint.get(key) || [];
        arr.push({ method, path: urlPath, requestBody: body, status, start, source, scenarioId, stepName });
        byEndpoint.set(key, arr);
      }
    }
  } catch {
    return new Map<string, any[]>();
  }

  const finalMap = new Map<string, Array<{ summary: string; value: any }>>();
  for (const [key, values] of byEndpoint.entries()) {
    const sorted = [...values].sort((a, b) => b.start - a.start);
    const deduped = dedupeExamples(sorted).slice(0, 8);
    let successIndex = 0;
    let failureIndex = 0;
    const formatted = deduped.map((v) => {
      const isFailure = Number(v.status || 0) >= 400;
      const classIndex = isFailure ? ++failureIndex : ++successIndex;
      return {
        summary: makeSummary(v, classIndex),
        value: v.requestBody
      };
    });
    finalMap.set(key, formatted);
  }
  return finalMap;
}
