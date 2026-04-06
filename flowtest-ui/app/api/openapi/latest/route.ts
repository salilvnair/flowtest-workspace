import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";

const OPENAPI_CACHE_FILE = path.resolve(process.cwd(), ".flowtest-cache/openapi-latest.json");

function sampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return "sample";
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const t = String(schema.type || "");
  if (t === "string") return "sample";
  if (t === "number" || t === "integer") return 0;
  if (t === "boolean") return true;
  if (t === "array") return [sampleFromSchema(schema.items)];
  if (t === "object" || schema.properties) {
    const out: Record<string, any> = {};
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const [k, v] of Object.entries(props)) out[k] = sampleFromSchema(v);
    return out;
  }
  return "sample";
}

function pickStatus(node: any, fallback: number): string {
  return String(Number(node?.httpStatus ?? node?.statusCode ?? fallback));
}

function toExampleKey(input: string, fallback: string): string {
  const key = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || fallback;
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

function toOpenApiIfNeeded(raw: any): any {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (raw.openapi && raw.paths && typeof raw.paths === "object") return raw;
  if (!Array.isArray(raw.apis)) return raw;

  const paths: Record<string, any> = {};
  for (const api of raw.apis as Array<any>) {
    if (!api || typeof api !== "object") continue;
    const method = String(api.method || "post").toLowerCase();
    const pathKey = String(api.path || "").trim();
    if (!pathKey) continue;
    const requestSchema =
      (api.requestSchema && typeof api.requestSchema === "object" ? api.requestSchema : undefined) ||
      (api.request && typeof api.request === "object" ? api.request : undefined);
    const responseNodes = normalizeResponses(api);
    const responses: Record<string, any> = {};
    const statusExampleCounter: Record<string, { success: number; failure: number }> = {};

    for (const node of responseNodes) {
      const status = pickStatus(node, 200);
      const bodySchema = node?.body && typeof node.body === "object" ? node.body : undefined;
      const example = node?.sample ?? node?.example ?? (bodySchema ? sampleFromSchema(bodySchema) : undefined);
      const statusNum = Number(status);
      const isFailure = statusNum >= 400;
      const media = responses[status]?.content?.["application/json"] || {};
      if (!responses[status]) {
        responses[status] = {
          description: String(node?.name || node?.errorCode || (isFailure ? "Failure response" : "Success response")),
          content: {
            "application/json": {
              ...(bodySchema ? { schema: bodySchema } : {})
            }
          }
        };
      }
      if (bodySchema && !responses[status].content["application/json"]?.schema) {
        responses[status].content["application/json"].schema = bodySchema;
      }
      if (example !== undefined) {
        const counter = statusExampleCounter[status] || { success: 0, failure: 0 };
        if (isFailure) counter.failure += 1;
        else counter.success += 1;
        statusExampleCounter[status] = counter;
        const variant = isFailure ? `failure_${counter.failure}` : `success_${counter.success}`;
        const label = toExampleKey(node?.name || node?.errorCode || variant, variant);
        const existing = (media.examples && typeof media.examples === "object") ? media.examples : {};
        const withUniqueKey = existing[label] ? `${label}_${isFailure ? counter.failure : counter.success}` : label;
        responses[status].content["application/json"].examples = {
          ...existing,
          [withUniqueKey]: { summary: withUniqueKey, value: example }
        };
        if (!responses[status].content["application/json"].examples || Object.keys(responses[status].content["application/json"].examples).length === 0) {
          responses[status].content["application/json"].example = example;
        } else {
          delete responses[status].content["application/json"].example;
        }
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

    const op: Record<string, any> = {
      operationId: String(api.apiId || `${method}_${pathKey.replace(/[^\w]/g, "_")}`),
      summary: String(api.name || `${method.toUpperCase()} ${pathKey}`),
      description: String(api.purpose || ""),
      responses
    };
    const requestExample = requestSchema ? sampleFromSchema(requestSchema) : undefined;
    if (requestSchema) {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: requestSchema,
            ...(requestExample ? { example: requestExample } : {})
          }
        }
      };
    }
    paths[pathKey] = { ...(paths[pathKey] || {}), [method]: op };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: String(raw.project || "FlowTest Generated API Spec"),
      version: String(raw.version || "1.0.0"),
      description: "Converted from AI generated API spec"
    },
    paths
  };
}

export async function GET() {
  try {
    const raw = await readFile(OPENAPI_CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const json = toOpenApiIfNeeded(parsed);
    return NextResponse.json(json, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || "OpenAPI spec not available yet") },
      { status: 404 }
    );
  }
}
