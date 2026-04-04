import { NextRequest, NextResponse } from "next/server";

const ENGINE_BASE_URL = process.env.FLOWTEST_ENGINE_BASE_URL ?? "http://localhost:8080";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const upstream = await fetch(`${ENGINE_BASE_URL}/api/scenarios/run-temporal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" }
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
