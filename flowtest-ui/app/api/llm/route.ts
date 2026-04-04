import { NextRequest, NextResponse } from "next/server";

const provider = (process.env.FLOWTEST_LLM_PROVIDER ?? "openai").toLowerCase();

function endpoint(): string {
  if (provider === "lmstudio") {
    return process.env.LMSTUDIO_CHAT_URL ?? "http://localhost:1234/v1/chat/completions";
  }
  return process.env.OPENAI_CHAT_URL ?? "https://api.openai.com/v1/chat/completions";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = endpoint();
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is missing" }, { status: 400 });
      }
      headers.Authorization = `Bearer ${key}`;
    }

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" }
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? String(error) }, { status: 500 });
  }
}
