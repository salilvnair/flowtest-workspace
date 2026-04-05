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
    const successNode = api.responses?.success && typeof api.responses.success === "object" ? api.responses.success : {};
    const successStatus = String(Number(successNode.statusCode || 200));
    const successSchema = successNode.body && typeof successNode.body === "object" ? successNode.body : undefined;
    const successExample = successNode.example ?? (successSchema ? sampleFromSchema(successSchema) : undefined);
    const failures = Array.isArray(api.responses?.failures) ? api.responses.failures : [];

    const responses: Record<string, any> = {
      [successStatus]: {
        description: "Success response",
        content: {
          "application/json": {
            ...(successSchema ? { schema: successSchema } : {}),
            ...(successExample ? { example: successExample } : {})
          }
        }
      }
    };
    for (const f of failures) {
      const code = String(Number(f?.statusCode || 400));
      const bodySchema = f?.body && typeof f.body === "object" ? f.body : undefined;
      const example = f?.example ?? (bodySchema ? sampleFromSchema(bodySchema) : undefined);
      responses[code] = {
        description: String(f?.name || f?.errorCode || "Failure response"),
        content: {
          "application/json": {
            ...(bodySchema ? { schema: bodySchema } : {}),
            ...(example ? { example } : {})
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
    if (requestSchema) {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: requestSchema,
            example: sampleFromSchema(requestSchema)
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
