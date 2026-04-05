import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";

const ENGINE_BASE_URL = process.env.FLOWTEST_ENGINE_BASE_URL ?? "http://localhost:8080";
const OPENAPI_CACHE_FILE = path.resolve(process.cwd(), ".flowtest-cache/openapi-latest.json");

type JsonMap = Record<string, any>;

function sampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return "sample";
  const t = String(schema.type || "");
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (t === "string") return "sample";
  if (t === "number" || t === "integer") return 0;
  if (t === "boolean") return true;
  if (t === "array") return [sampleFromSchema(schema.items)];
  if (t === "object" || schema.properties) {
    const out: JsonMap = {};
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const [k, v] of Object.entries(props)) out[k] = sampleFromSchema(v);
    return out;
  }
  return "sample";
}

function pickStatus(node: any, fallback: number): string {
  return String(Number(node?.httpStatus ?? node?.statusCode ?? fallback));
}

function normalizeResponses(api: any): Array<any> {
  if (Array.isArray(api?.responses)) {
    return api.responses.filter((r: any) => r && typeof r === "object");
  }

  const out: Array<any> = [];
  const success = api?.responses?.success;
  if (success && typeof success === "object") out.push(success);
  const failures = Array.isArray(api?.responses?.failures) ? api.responses.failures : [];
  for (const f of failures) {
    if (f && typeof f === "object") out.push(f);
  }
  return out;
}

function toOpenApiIfNeeded(raw: JsonMap | null): JsonMap | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.openapi && raw.paths && typeof raw.paths === "object") return raw;
  if (!Array.isArray(raw.apis)) return raw;

  const paths: JsonMap = {};
  for (const api of raw.apis as Array<any>) {
    if (!api || typeof api !== "object") continue;
    const method = String(api.method || "post").toLowerCase();
    const pathKey = String(api.path || "").trim();
    if (!pathKey) continue;
    const requestSchema =
      (api.requestSchema && typeof api.requestSchema === "object" ? api.requestSchema : undefined) ||
      (api.request && typeof api.request === "object" ? api.request : undefined);
    const responseNodes = normalizeResponses(api);
    const successNode = responseNodes.find((n: any) => Number(n?.httpStatus ?? n?.statusCode ?? 200) < 400) || {};
    const successStatus = pickStatus(successNode, 200);
    const successSchema =
      (successNode?.body && typeof successNode.body === "object" ? successNode.body : undefined) ||
      (api.responseSchema?.success && typeof api.responseSchema.success === "object" ? api.responseSchema.success : undefined);
    const successExample =
      successNode?.sample ?? successNode?.example ?? api.successExample ?? (successSchema ? sampleFromSchema(successSchema) : undefined);
    const failureNodes = responseNodes.filter((n: any) => Number(n?.httpStatus ?? n?.statusCode ?? 0) >= 400);
    const failureExamples = Array.isArray(api.failureExamples) ? api.failureExamples : [];

    const responses: JsonMap = {};
    responses[successStatus] = {
      description: "Success response",
      content: {
        "application/json": {
          ...(successSchema ? { schema: successSchema } : {}),
          ...(successExample ? { example: successExample } : {})
        }
      }
    };

    for (let i = 0; i < failureNodes.length; i++) {
      const f = failureNodes[i] || {};
      const code = pickStatus(f, 400);
      const bodySchema = f.body && typeof f.body === "object" ? f.body : undefined;
      const example = f.sample ?? f.example ?? (bodySchema ? sampleFromSchema(bodySchema) : undefined);
      if (!responses[code]) {
        responses[code] = {
          description: String(f.name || f.errorCode || "Failure response"),
          content: {
            "application/json": {
              ...(bodySchema ? { schema: bodySchema } : {}),
              ...(example ? { example } : {})
            }
          }
        };
      }
    }

    if (!responses["200"]) {
      responses["200"] = {
        description: "Success response",
        content: {
          "application/json": {
            example: {}
          }
        }
      };
    }

    if (failureExamples.length > 0) {
      const existing400 = responses["400"] || { description: "Failure response", content: { "application/json": {} } };
      const media = (existing400.content && existing400.content["application/json"]) ? existing400.content["application/json"] : {};
      const ex: JsonMap = { ...(media.examples || {}) };
      for (let i = 0; i < failureExamples.length; i++) {
        const item = failureExamples[i] || {};
        const key = String(item.name || item.errorCode || `failure_${i + 1}`);
        const val = item.example ?? item;
        ex[key] = { summary: key, value: val };
      }
      responses["400"] = {
        ...existing400,
        content: {
          "application/json": {
            ...media,
            examples: ex
          }
        }
      };
    }

    const operation: JsonMap = {
      operationId: String(api.apiId || `${method}_${pathKey.replace(/[^\w]/g, "_")}`),
      summary: String(api.name || `${method.toUpperCase()} ${pathKey}`),
      description: String(api.purpose || ""),
      responses
    };
    if (requestSchema) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: requestSchema,
            example: sampleFromSchema(requestSchema)
          }
        }
      };
    }

    paths[pathKey] = { ...(paths[pathKey] || {}), [method]: operation };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: String(raw.project || "FlowTest Generated API Spec"),
      version: String(raw.version || "1.0.0"),
      description: "OpenAPI converted from AI-generated API spec"
    },
    paths
  };
}

async function readGeneratedApiSpec(): Promise<JsonMap | null> {
  try {
    const raw = await readFile(OPENAPI_CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return toOpenApiIfNeeded(parsed as JsonMap);
  } catch {
    // ignore when generated spec is unavailable
  }
  return null;
}

function mergeOpenApi(runtimeSpec: JsonMap, generatedSpec: JsonMap | null): JsonMap {
  if (!generatedSpec?.paths || typeof generatedSpec.paths !== "object") return runtimeSpec;
  const merged: JsonMap = { ...runtimeSpec };
  const mergedPaths: JsonMap = { ...(runtimeSpec.paths || {}) };
  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

  for (const [pathKey, genPathNodeRaw] of Object.entries(generatedSpec.paths || {})) {
    const genPathNode = (genPathNodeRaw && typeof genPathNodeRaw === "object") ? (genPathNodeRaw as JsonMap) : {};
    const runtimePathNode = (mergedPaths[pathKey] && typeof mergedPaths[pathKey] === "object")
      ? (mergedPaths[pathKey] as JsonMap)
      : {};
    const pathOut: JsonMap = { ...runtimePathNode };

    for (const method of methods) {
      const genOp = (genPathNode[method] && typeof genPathNode[method] === "object") ? (genPathNode[method] as JsonMap) : null;
      const runOp = (runtimePathNode[method] && typeof runtimePathNode[method] === "object") ? (runtimePathNode[method] as JsonMap) : null;
      if (!genOp && !runOp) continue;
      if (!runOp && genOp) {
        pathOut[method] = genOp;
        continue;
      }
      if (!runOp) continue;

      const runResponses: JsonMap = (runOp.responses && typeof runOp.responses === "object") ? { ...runOp.responses } : {};
      const genResponses: JsonMap = (genOp?.responses && typeof genOp.responses === "object") ? genOp.responses : {};
      for (const [statusCode, genResp] of Object.entries(genResponses)) {
        if (!runResponses[statusCode]) runResponses[statusCode] = genResp;
      }

      pathOut[method] = {
        ...genOp,
        ...runOp,
        requestBody: runOp.requestBody || genOp?.requestBody,
        parameters: (Array.isArray(runOp.parameters) && runOp.parameters.length > 0) ? runOp.parameters : genOp?.parameters,
        responses: runResponses
      };
    }

    mergedPaths[pathKey] = pathOut;
  }

  merged.paths = mergedPaths;
  merged.info = {
    ...(generatedSpec?.info && typeof generatedSpec.info === "object" ? generatedSpec.info : {}),
    ...(runtimeSpec?.info && typeof runtimeSpec.info === "object" ? runtimeSpec.info : {}),
    title: "FlowTest API Explorer",
    description: "Merged Runtime WireMock + Generated API Spec (success and failure responses)"
  };
  if (!merged.components && generatedSpec.components) merged.components = generatedSpec.components;
  if (!merged.tags && generatedSpec.tags) merged.tags = generatedSpec.tags;
  return merged;
}

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/openapi`, {
      method: "GET",
      cache: "no-store"
    });
    const text = await res.text();
    const runtimeSpec = JSON.parse(text);
    const generatedSpec = await readGeneratedApiSpec();
    const merged = mergeOpenApi(runtimeSpec, generatedSpec);
    return NextResponse.json(merged, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error || "Failed to fetch runtime OpenAPI") },
      { status: 500 }
    );
  }
}
