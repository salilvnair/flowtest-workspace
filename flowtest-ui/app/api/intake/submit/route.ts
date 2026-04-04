import { NextRequest, NextResponse } from "next/server";
import type { StartIntakePayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as StartIntakePayload;

    const successCount = Array.isArray(payload.successSamples) ? payload.successSamples.length : 0;
    const failureCount = Array.isArray(payload.failureSamples) ? payload.failureSamples.length : 0;

    return NextResponse.json({
      ok: true,
      acceptedAt: new Date().toISOString(),
      summary: {
        runName: payload.runName || "flowtest-run",
        outputPath: payload.outputPath || "",
        multiUpload: !!payload.multiUpload,
        fakeRun: !!payload.fakeRun,
        successCount,
        failureCount,
        hasAid: !!payload.aid,
        hasHld: !!payload.hld
      },
      payload
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 400 }
    );
  }
}
