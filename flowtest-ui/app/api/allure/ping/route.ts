import { NextRequest, NextResponse } from "next/server";

function isAllowedTarget(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = String(req.nextUrl.searchParams.get("url") || "").trim();
  if (!url || !isAllowedTarget(url)) {
    return NextResponse.json({ ok: false, ready: false, error: "Invalid target url" }, { status: 400 });
  }
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return NextResponse.json({ ok: true, ready: res.ok, status: res.status, statusText: res.statusText });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, ready: false, error: String(error?.message || error || "Ping failed") },
      { status: 200 }
    );
  }
}

