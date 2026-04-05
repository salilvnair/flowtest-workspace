import { NextRequest, NextResponse } from "next/server";

const ENGINE_BASE_URL = process.env.FLOWTEST_ENGINE_BASE_URL ?? "http://localhost:8080";

function isAllowedTarget(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function toJsonIfPossible(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return text;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

async function fallbackFromMappings(target: string, method: string): Promise<NextResponse | null> {
  try {
    const targetUrl = new URL(target);
    const targetPath = targetUrl.pathname || "/";
    const res = await fetch(`${ENGINE_BASE_URL.replace(/\/+$/, "")}/api/scenarios/wiremock/mappings`, {
      method: "GET",
      cache: "no-store"
    });
    if (!res.ok) return null;
    const json = await res.json();
    const mappings = Array.isArray(json?.mappings) ? json.mappings : [];
    const match = mappings.find((m: any) => {
      const mm = String(m?.method || "").toUpperCase();
      const uu = String(m?.url || "").trim();
      return mm === method && uu === targetPath;
    });
    if (!match) return null;

    const status = Number(match?.status ?? 200);
    const body = toJsonIfPossible(match?.responseBody ?? {});
    return NextResponse.json(body, {
      status: Number.isFinite(status) ? status : 200
    });
  } catch {
    return null;
  }
}

async function handle(req: NextRequest) {
  try {
    const target = String(req.nextUrl.searchParams.get("scalar_url") || "").trim();
    if (!target || !isAllowedTarget(target)) {
      return NextResponse.json({ ok: false, error: "Target URL is missing or not allowed." }, { status: 400 });
    }

    const method = req.method.toUpperCase();
    const headers: Record<string, string> = {};

    const accept = req.headers.get("accept");
    const contentType = req.headers.get("content-type");
    const authorization = req.headers.get("authorization");
    if (accept) headers["accept"] = accept;
    if (contentType) headers["content-type"] = contentType;
    if (authorization) headers["authorization"] = authorization;

    const canHaveBody = !["GET", "HEAD"].includes(method);
    const bodyText = canHaveBody ? await req.text() : "";

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method,
        headers,
        body: canHaveBody && bodyText ? bodyText : undefined,
        cache: "no-store",
        redirect: "manual"
      });
    } catch (networkError: any) {
      const fallback = await fallbackFromMappings(target, method);
      if (fallback) return fallback;
      return NextResponse.json(
        {
          ok: false,
          error: `WireMock target not reachable: ${String(networkError?.message || networkError || "network error")}`,
          hint: "Runtime WireMock port may have stopped. Re-run scenario, or use /api/scenarios/wiremock/mappings."
        },
        { status: 502 }
      );
    }

    const upstreamText = await upstream.text();
    const outHeaders = new Headers();
    const upstreamCt = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    outHeaders.set("content-type", upstreamCt);

    return new NextResponse(upstreamText, {
      status: upstream.status,
      headers: outHeaders
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error || "Proxy call failed") },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function PUT(req: NextRequest) {
  return handle(req);
}

export async function PATCH(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}

export async function OPTIONS(req: NextRequest) {
  return handle(req);
}
