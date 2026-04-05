import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";

const OPENAPI_CACHE_FILE = path.resolve(process.cwd(), ".flowtest-cache/openapi-latest.json");

export async function GET() {
  try {
    const raw = await readFile(OPENAPI_CACHE_FILE, "utf-8");
    const json = JSON.parse(raw);
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

