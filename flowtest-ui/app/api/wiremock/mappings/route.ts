import { NextResponse } from "next/server";

const ENGINE_BASE_URL = process.env.FLOWTEST_ENGINE_BASE_URL ?? "http://localhost:8080";

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/mappings`, {
      method: "GET",
      cache: "no-store"
    });
    const text = await res.text();
    const json = JSON.parse(text);
    return NextResponse.json(json, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error || "Failed to fetch runtime mappings") },
      { status: 500 }
    );
  }
}

