import { NextRequest, NextResponse } from "next/server";

function isAllowedTarget(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "").trim();
    const method = String(body?.method || "GET").toUpperCase();
    const requestBody = body?.body;

    if (!url || !isAllowedTarget(url)) {
      return NextResponse.json({ ok: false, error: "Target URL is missing or not allowed." }, { status: 400 });
    }

    const headers: Record<string, string> = {};
    if (requestBody && method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: requestBody && method !== "GET" && method !== "HEAD" ? JSON.stringify(requestBody) : undefined,
      cache: "no-store"
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        data: parsed
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error || "Proxy call failed") },
      { status: 500 }
    );
  }
}

