"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createFakeRunFixture } from "@/lib/faker";
import { STATUS_PANEL_TEMPLATE } from "@/lib/status-panel-template";
import vscodeThemeVars from "@/lib/vscode-theme-vars.json";

type WebviewMsg = {
  type?: string;
  payload?: any;
  url?: string;
};

function hhmmss(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function mmss(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function durationMsToMmss(durationMs: unknown): string {
  const n = Number(durationMs);
  if (!Number.isFinite(n) || n <= 0) return "00:00";
  return mmss(Math.max(1, Math.ceil(n / 1000)));
}

export function FlowtestDashboard() {
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Array<{ type: string; payload: any }>>([]);
  const timersRef = useRef<number[]>([]);
  const renderedRealRef = useRef(false);
  const sessionRef = useRef(0);
  const streamAbortRef = useRef<{ abort: () => void } | null>(null);

  const applyThemeVars = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    const vars = vscodeThemeVars as Record<string, string>;
    const root = doc.documentElement;
    Object.entries(vars).forEach(([k, v]) => {
      if (!k.startsWith("--vscode-")) return;
      root.style.setProperty(k, String(v));
    });
    if (doc.body && !doc.body.classList.contains("vscode-dark")) {
      doc.body.classList.add("vscode-dark");
    }
  };

  const srcDoc = useMemo(() => {
    const theme = vscodeThemeVars as Record<string, string>;
    const tv = (k: string, d: string) => String(theme[k] || d);
    const palette = {
      fg: tv("--vscode-editor-foreground", "#d4d4d4"),
      muted: tv("--vscode-descriptionForeground", "#8c8c8c"),
      bg: tv("--vscode-editor-background", "#1e1e1e"),
      widget: tv("--vscode-editorWidget-background", "#252526"),
      panel: tv("--vscode-panel-border", "#3c3c3c"),
      focus: tv("--vscode-focusBorder", "#3794ff"),
      info: tv("--vscode-charts-blue", "#3794ff"),
      ok: tv("--vscode-charts-green", "#89d185"),
      warn: tv("--vscode-charts-yellow", "#e2c08d"),
      err: tv("--vscode-charts-red", "#f14c4c")
    };

    const fallbackStyle = `
<style id="ft-vscode-fallback-vars">
  :root {
    --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --vscode-editor-font-family: Menlo, Monaco, "Courier New", monospace;
    --vscode-editor-font-size: 12px;
    --vscode-font-size: 13px;
    --vscode-editor-background: ${palette.bg};
    --vscode-editor-foreground: ${palette.fg};
    --vscode-descriptionForeground: ${palette.muted};
    --vscode-panel-border: ${palette.panel};
    --vscode-editorWidget-background: ${palette.widget};
    --vscode-focusBorder: ${palette.focus};
    --vscode-charts-blue: ${palette.info};
    --vscode-charts-green: ${palette.ok};
    --vscode-charts-yellow: ${palette.warn};
    --vscode-charts-red: ${palette.err};
    --vscode-testing-iconPassed: ${palette.ok};
    --vscode-testing-iconQueued: ${palette.warn};
    --vscode-testing-iconFailed: ${palette.err};
  }
  body.vscode-dark, body {
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
  }
</style>`;

    const apiShim = `
<script>
window.acquireVsCodeApi = function(){
  return {
    postMessage: function(msg){ try { window.parent.postMessage({ __ftWebview: true, msg: msg }, '*'); } catch(e) {} },
    setState: function(){},
    getState: function(){ return null; }
  };
};
</script>`;

    const lateTheme = `
<style id="ft-run-center-late-theme">
  :root{
    --bg:var(--vscode-editor-background) !important;
    --fg:var(--vscode-editor-foreground) !important;
    --muted:var(--vscode-descriptionForeground) !important;
    --border:var(--vscode-panel-border) !important;
    --card:color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent) !important;
    --ok:var(--vscode-testing-iconPassed) !important;
    --warn:var(--vscode-testing-iconQueued) !important;
    --err:var(--vscode-testing-iconFailed) !important;
    --info:var(--vscode-charts-blue) !important;
  }
  body.vscode-dark{
    color:${palette.fg} !important;
    background:
      radial-gradient(860px 420px at -12% -20%, color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent), transparent 64%),
      radial-gradient(940px 520px at 115% 118%, color-mix(in srgb, var(--vscode-charts-green) 20%, transparent), transparent 67%),
      var(--vscode-editor-background) !important;
  }
  h1,.hero h1,.sectionTitle,.sectionHead,.sectionHeadLeft,.sectionHeadLeft *,
  .metaChip .mv,.metaChip .mv *,.metaValueText,.tile .v,#runMeta,#runMeta *{
    color:${palette.fg} !important;
  }
  .metaChip .mk,.tile .k,.sectionHead,.summary{
    color:${palette.muted} !important;
  }
  #runMeta .metaChip{
    background: #2a2d33 !important;
    border-color: color-mix(in srgb, ${palette.panel} 78%, #4a4f58) !important;
  }
  #runMeta .metaChip .mk{
    color: color-mix(in srgb, ${palette.muted} 92%, #c0c6cf) !important;
  }
  #runMeta .metaChip .mv,
  #runMeta .metaChip .metaValueText{
    color: #69b4ff !important;
  }
  .scenarioModeChip{
    color: #9fd1ff !important;
    border-color: color-mix(in srgb, #9fd1ff 42%, var(--vscode-panel-border)) !important;
    background: color-mix(in srgb, #9fd1ff 16%, transparent) !important;
    font-weight: 800;
  }
  .scenarioModeChip[data-mode='extensive']{
    color: #ffd27d !important;
    border-color: color-mix(in srgb, #ffd27d 45%, var(--vscode-panel-border)) !important;
    background: color-mix(in srgb, #ffd27d 15%, transparent) !important;
  }
</style>`;

    let html = STATUS_PANEL_TEMPLATE.replace(
      "if (fb) fb.style.display = 'none';",
      "if (fb) fb.style.display = (p && p.allowFake) ? '' : 'none';"
    );
    html = html.replace(
      "if (intakeMode) intakeMode.textContent = String(p.intakeMode || '-');",
      "if (intakeMode) { var sm = String((p && p.scenarioMode) || 'quick'); intakeMode.textContent = String(p.intakeMode || '-') + ' • ' + (sm === 'extensive' ? 'Extensive' : 'Quick'); } try { if (typeof updateScenarioModeChip === 'function') updateScenarioModeChip((p && p.scenarioMode) || 'quick'); } catch {}"
    );
    html = html.replace(
      "function updateLayout() {",
      "function updateScenarioModeChip(modeRaw){var mode=String(modeRaw||'quick').toLowerCase()==='extensive'?'extensive':'quick';var label=mode==='extensive'?'Extensive':'Quick';var heads=document.querySelectorAll('.sectionHeadRight');var target=null;for(var i=0;i<heads.length;i++){var h=heads[i];if(h&&h.querySelector&&h.querySelector('.followToggle')){target=h;break;}}if(!target)return;var chip=target.querySelector('#scenarioModeChip');if(!chip){chip=document.createElement('span');chip.id='scenarioModeChip';chip.className='chip scenarioModeChip';target.insertBefore(chip,target.firstChild);}chip.textContent='Scenario: '+label;chip.setAttribute('data-mode',mode);} function updateLayout() {"
    );
    html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
    html = html.replace(
      "const done = s.includes('complete') || s.includes('success');",
      "const done = s.includes('complete') || s.includes('success') || s.includes('fail') || s.includes('error') || s.includes('cancel');"
    );
    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${fallbackStyle}${apiShim}`);
    }
    if (html.includes("<body") && !html.includes("class=\"vscode-dark\"")) {
      html = html.replace("<body", "<body class=\"vscode-dark\"");
    }
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${lateTheme}</head>`);
    }
    return html;
  }, []);

  const postToWebview = (type: string, payload: any) => {
    if (readyRef.current && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type, payload }, "*");
      return;
    }
    queueRef.current.push({ type, payload });
  };

  const flushQueue = () => {
    if (!readyRef.current || !iframeRef.current?.contentWindow) return;
    const items = [...queueRef.current];
    queueRef.current = [];
    for (const item of items) {
      iframeRef.current.contentWindow.postMessage(item, "*");
    }
  };

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };

  const schedule = (fn: () => void, delayMs: number) => {
    const t = window.setTimeout(fn, delayMs);
    timersRef.current.push(t);
  };

  const pushEvent = (ev: any, delayMs: number) => {
    schedule(() => {
      const baseMeta = {
        stage: String(ev.stage || ""),
        status: String(ev.status || ""),
        title: String(ev.title || "")
      };
      postToWebview("event", {
        time: ev.time || hhmmss(new Date()),
        stage: ev.stage,
        status: ev.status,
        title: ev.title,
        detail: ev.detail,
        meta: { ...baseMeta, ...(ev.meta || {}) },
        actions: ev.actions
      });
    }, delayMs);
  };

  const parseJsonSafe = (text: string): any | null => {
    try {
      return JSON.parse(String(text || ""));
    } catch {
      return null;
    }
  };

  const aiRequestContent = (trace: any) =>
    JSON.stringify(
      {
        provider: trace?.provider,
        model: trace?.model,
        taskType: trace?.taskType,
        calledAt: trace?.calledAt,
        systemPrompt: trace?.systemPrompt,
        userPrompt: trace?.userPrompt,
        requestPayload: trace?.requestPayload
      },
      null,
      2
    );

  const handleLiveMessage = (message: { type?: string; payload?: any }): "continue" | "final" => {
    const t = String(message?.type || "");
    const payload = message?.payload;
    if (t === "init") postToWebview("init", payload);
    else if (t === "summary") postToWebview("summary", payload);
    else if (t === "event") postToWebview("event", payload);
    else if (t === "temporal") postToWebview("temporal", payload);
    else if (t === "meta") postToWebview("meta", payload);
    else if (t === "final") {
      localStorage.setItem("flowtest:lastIntakeResponse", JSON.stringify(payload));
      localStorage.removeItem("flowtest:lastIntakeError");
      return "final";
    } else if (t === "error") {
      const msg = String(payload?.message || "Streaming run failed");
      localStorage.setItem("flowtest:lastIntakeError", msg);
      postToWebview("event", {
        time: hhmmss(new Date()),
        stage: "RUN",
        status: "error",
        title: "Failed",
        detail: msg
      });
      postToWebview("summary", { status: "Failed", detail: msg });
      return "final";
    }
    return "continue";
  };

  const startStreamingRunSse = async (
    intake: any,
    sessionId: number,
    runName: string,
    mode: string,
    successCount: number,
    failureCount: number
  ) => {
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    renderedRealRef.current = true;
    let sawFinal = false;

    try {
      const res = await fetch("/api/intake/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intake),
        signal: abortController.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`intake stream failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (sessionRef.current !== sessionId) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split >= 0) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const dataLines = block
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());
          const raw = dataLines.join("\n");
          if (raw) {
            try {
              const message = JSON.parse(raw) as { type?: string; payload?: any };
              const state = handleLiveMessage(message);
              if (state === "final") sawFinal = true;
            } catch {
              // ignore malformed SSE chunk
            }
          }
          split = buffer.indexOf("\n\n");
        }
      }

      if (!sawFinal && !abortController.signal.aborted) {
        const msg = "Stream ended before final payload";
        localStorage.setItem("flowtest:lastIntakeError", msg);
        postToWebview("event", {
          time: hhmmss(new Date()),
          stage: "RUN",
          status: "error",
          title: "Failed",
          detail: msg
        });
        postToWebview("summary", { status: "Failed", detail: msg });
      }
    } catch (error: any) {
      if (abortController.signal.aborted) return;
      const msg = String(error?.message || error || "Streaming run failed");
      localStorage.setItem("flowtest:lastIntakeError", msg);
      postToWebview("event", {
        time: hhmmss(new Date()),
        stage: "RUN",
        status: "error",
        title: "Failed",
        detail: msg
      });
      postToWebview("summary", { status: "Failed", detail: msg });
    } finally {
      if (streamAbortRef.current === abortController) {
        streamAbortRef.current = null;
      }
    }
  };

  const startStreamingRun = async (
    intake: any,
    sessionId: number,
    runName: string,
    mode: string,
    successCount: number,
    failureCount: number
  ) => {
    const scenarioMode = String((intake as any)?.scenarioMode || "quick").toLowerCase() === "extensive" ? "extensive" : "quick";
    postToWebview("init", {
      runName,
      orchestrationId: "streaming",
      temporalLink: "http://localhost:8233/namespaces/default/workflows",
      successCount,
      failureCount,
      intakeMode: mode,
      scenarioMode,
      allowFake: false
    });
    postToWebview("summary", { status: "Running", detail: "Starting live intake orchestration..." });
    postToWebview("event", {
      time: hhmmss(new Date()),
      stage: "RUN",
      status: "running",
      title: "Started"
    });
    postToWebview("event", {
      time: hhmmss(new Date()),
      stage: "UI",
      status: "info",
      title: "Status Panel Initialized"
    });

    try {
      await fetch("/api/ws", { cache: "no-store" });
      const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/ws`;
      await new Promise<void>((resolve, reject) => {
        let opened = false;
        let sawFinal = false;
        let settled = false;
        const ws = new WebSocket(wsUrl);
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          try {
            ws.close();
          } catch {
            // ignore
          }
          if (error) reject(error);
          else resolve();
        };
        streamAbortRef.current = {
          abort: () => finish()
        };
        ws.onopen = () => {
          opened = true;
          ws.send(JSON.stringify({ type: "start", payload: intake }));
        };
        ws.onmessage = (ev) => {
          if (sessionRef.current !== sessionId) {
            finish();
            return;
          }
          try {
            const msg = JSON.parse(String(ev.data || "{}")) as { type?: string; payload?: any };
            const state = handleLiveMessage(msg);
            if (state === "final") {
              sawFinal = true;
              finish();
            }
          } catch {
            // ignore malformed WS message
          }
        };
        ws.onerror = () => {
          if (!opened && !sawFinal) finish(new Error("websocket connection failed"));
        };
        ws.onclose = () => {
          if (sawFinal) finish();
          else if (!opened) finish(new Error("websocket closed before open"));
          else finish(new Error("websocket closed before final payload"));
        };
      });
    } catch {
      await startStreamingRunSse(intake, sessionId, runName, mode, successCount, failureCount);
    } finally {
      streamAbortRef.current = null;
    }
  };

  const runRealFromResponse = (intake: any, response: any, sessionId: number) => {
    const runName = String(intake?.runName || response?.summary?.runName || "flowtest-run");
    const mode = intake?.multiUpload ? "multi upload" : "row mode";
    const successCount = Array.isArray(intake?.successSamples) ? intake.successSamples.length : 0;
    const failureCount = Array.isArray(intake?.failureSamples) ? intake.failureSamples.length : 0;
    const orchestrationId = String(crypto.randomUUID?.() || "orchestration");
    const temporalBase = "http://localhost:8233/namespaces/default/workflows";
    const workflowId = String(response?.engine?.workflowId || "");
    const runId = String(response?.engine?.runId || "");
    const temporalLink = workflowId ? `${temporalBase}/${workflowId}${runId ? `/${runId}` : ""}` : temporalBase;
    const outputPath = String(intake?.outputPath || response?.summary?.outputPath || "").trim() || "-";
    const wiremockBaseUrl = String(response?.chain?.parsed?.wiremockBaseUrl || "").trim() || "-";
    const allureResultsPath = String(response?.chain?.parsed?.allureResultsPath || "").trim() || "-";
    const allureReportPath = String(response?.chain?.parsed?.allureReportPath || response?.allure?.reportPath || "").trim() || "-";
    const allureGenerateCommand = String(response?.chain?.parsed?.allureGenerateCommand || "").trim() || "-";
    const allureUrl = String(response?.allure?.url || "").trim();
    const wiremockAdminMappingsUrl =
      String(response?.docs?.wiremockAdminMappingsUrl || "").trim()
      || "http://localhost:8080/api/scenarios/wiremock/mappings";
    const wiremockOpenApiUrl =
      String(response?.docs?.wiremockOpenApiUrl || response?.docs?.openapiUrl || "").trim()
      || "/api/openapi/latest";
    const aiGeneratedDataUrl = `${window.location.origin}/ai-generated-data`;
    const apiExplorerUrl = `${window.location.origin}/api-explorer`;
    const preflightError = String(response?.chain?.parsed?.preflightError || "").trim();
    const scenarioMode = String(response?.chain?.parsed?.scenarioMode || intake?.scenarioMode || "quick").toLowerCase() === "extensive" ? "extensive" : "quick";
    const mockCoverageOk = Boolean(response?.chain?.parsed?.mockCoverageOk);
    const attachedMockCount = Number(response?.chain?.parsed?.attachedMockCount ?? 0);

    postToWebview("init", {
      runName,
      orchestrationId,
      temporalLink,
      successCount,
      failureCount,
      intakeMode: mode,
      scenarioMode,
      allowFake: false
    });
    postToWebview("summary", { status: "Running", detail: "Executing FlowTest chain..." });

    let d = 80;
    const step = 160;
    pushEvent({ stage: "RUN", status: "running", title: "Started" }, d); d += step;
    pushEvent({ stage: "UI", status: "info", title: "Status Panel Initialized" }, d); d += step;
    pushEvent({
      stage: "Intake",
      status: "running",
      title: "Received",
      detail: `docs=${(intake?.successSamples?.length || 0) + (intake?.failureSamples?.length || 0) + (intake?.aid ? 1 : 0) + (intake?.hld ? 1 : 0)} | intake_mode=${mode} | output_path=${outputPath}`
    }, d); d += step;

    const docs: Array<any> = [
      ...(Array.isArray(intake?.successSamples) ? intake.successSamples : []),
      ...(Array.isArray(intake?.failureSamples) ? intake.failureSamples : []),
      ...(intake?.aid ? [intake.aid] : []),
      ...(intake?.hld ? [intake.hld] : [])
    ];
    for (const doc of docs) {
      const name = String(doc?.fileName || doc?.title || "untitled");
      const type = String(doc?.type || "DOC");
      const chars = String(doc?.content || "").length;
      pushEvent({ stage: "Intake", status: "info", title: "Doc Loaded", detail: `[${type}] ${name} (${chars} chars)` }, d);
      d += 70;
    }
    pushEvent({ stage: "Intake", status: "info", title: "Normalized" }, d); d += step;
    pushEvent({ stage: "UI", status: "info", title: "Progress", detail: "Generating API spec..." }, d); d += step;

    const api = response?.chain?.traces?.apiSpec;
    if (api) {
      pushEvent({ stage: "API Spec", status: "running", title: "Started" }, d); d += step;
      pushEvent({
        stage: "API Spec",
        status: "running",
        title: "Ai Request Dispatched",
        detail: `task=GENERATE_API_SPEC | provider=${api.provider} | model=${api.model} | called_at=${api.calledAt}`,
        meta: {
          task: "GENERATE_API_SPEC",
          provider: api.provider,
          model: api.model,
          called_at: api.calledAt,
          error: false
        },
        actions: [{ label: "AI Request", title: "API Spec - AI Request", content: aiRequestContent(api) }]
      }, d); d += step;
      const apiOutput = String(api.responseText || "");
      pushEvent({
        stage: "API Spec",
        status: "success",
        title: "Ai Response Received",
        detail: `${apiOutput.length} chars | provider=${api.provider} | model=${api.model} | called_at=${api.calledAt} | completed_at=${api.completedAt} | duration=${api.durationMs}ms`,
        meta: {
          task: "GENERATE_API_SPEC",
          provider: api.provider,
          model: api.model,
          called_at: api.calledAt,
          completed_at: api.completedAt,
          duration_ms: api.durationMs,
          duration: durationMsToMmss(api.durationMs),
          response_chars: apiOutput.length,
          error: false
        },
        actions: [
          { label: "AI Request", title: "API Spec - AI Request", content: aiRequestContent(api) },
          { label: "AI Response", title: "API Spec - AI Response", content: apiOutput }
        ]
      }, d); d += step;
      pushEvent({ stage: "UI", status: "info", title: "Api Spec Section Rendered" }, d); d += step;
      pushEvent({ stage: "API Spec", status: "success", title: "Completed" }, d); d += step;
    }

    pushEvent({ stage: "UI", status: "info", title: "Progress", detail: "Generating WireMock definitions..." }, d); d += step;
    const wire = response?.chain?.traces?.wiremock;
    if (wire) {
      pushEvent({ stage: "WireMock", status: "running", title: "Started" }, d); d += step;
      pushEvent({
        stage: "WireMock",
        status: "running",
        title: "Ai Request Dispatched",
        detail: `task=GENERATE_MOCKS | provider=${wire.provider} | model=${wire.model} | called_at=${wire.calledAt}`,
        meta: { task: "GENERATE_MOCKS", provider: wire.provider, model: wire.model, called_at: wire.calledAt, error: false },
        actions: [{ label: "AI Request", title: "WireMock - AI Request", content: aiRequestContent(wire) }]
      }, d); d += step;
      const wireOutput = String(wire.responseText || "");
      pushEvent({
        stage: "WireMock",
        status: "success",
        title: "Ai Response Received",
        detail: `${wireOutput.length} chars | provider=${wire.provider} | model=${wire.model} | called_at=${wire.calledAt} | completed_at=${wire.completedAt} | duration=${wire.durationMs}ms`,
        meta: {
          task: "GENERATE_MOCKS",
          provider: wire.provider,
          model: wire.model,
          called_at: wire.calledAt,
          completed_at: wire.completedAt,
          duration_ms: wire.durationMs,
          duration: durationMsToMmss(wire.durationMs),
          response_chars: wireOutput.length,
          error: false
        },
        actions: [
          { label: "AI Request", title: "WireMock - AI Request", content: aiRequestContent(wire) },
          { label: "AI Response", title: "WireMock - AI Response", content: wireOutput }
        ]
      }, d); d += step;
      pushEvent({ stage: "UI", status: "info", title: "Wiremock Section Rendered" }, d); d += step;
      pushEvent({ stage: "WireMock", status: "success", title: "Completed" }, d); d += step;
    }

    pushEvent({ stage: "UI", status: "info", title: "Progress", detail: "Generating FlowTest scenario DSL..." }, d); d += step;
    const scenario = response?.chain?.traces?.scenario;
    if (scenario) {
      pushEvent({ stage: "Scenario DSL", status: "running", title: "Started" }, d); d += step;
      pushEvent({
        stage: "Scenario DSL",
        status: "running",
        title: "Ai Request Dispatched",
        detail: `task=GENERATE_SCENARIO | provider=${scenario.provider} | model=${scenario.model} | called_at=${scenario.calledAt}`,
        meta: { task: "GENERATE_SCENARIO", provider: scenario.provider, model: scenario.model, called_at: scenario.calledAt, error: false },
        actions: [{ label: "AI Request", title: "Scenario DSL - AI Request", content: aiRequestContent(scenario) }]
      }, d); d += step;
      const scOutput = String(scenario.responseText || "");
      pushEvent({
        stage: "Scenario DSL",
        status: "success",
        title: "Ai Response Received",
        detail: `${scOutput.length} chars | provider=${scenario.provider} | model=${scenario.model} | called_at=${scenario.calledAt} | completed_at=${scenario.completedAt} | duration=${scenario.durationMs}ms`,
        meta: {
          task: "GENERATE_SCENARIO",
          provider: scenario.provider,
          model: scenario.model,
          called_at: scenario.calledAt,
          completed_at: scenario.completedAt,
          duration_ms: scenario.durationMs,
          duration: durationMsToMmss(scenario.durationMs),
          response_chars: scOutput.length,
          error: false
        },
        actions: [
          { label: "AI Request", title: "Scenario DSL - AI Request", content: aiRequestContent(scenario) },
          { label: "AI Response", title: "Scenario DSL - AI Response", content: scOutput }
        ]
      }, d); d += step;
      pushEvent({ stage: "UI", status: "info", title: "Scenario Section Rendered" }, d); d += step;
      pushEvent({ stage: "Scenario DSL", status: "success", title: "Completed" }, d); d += step;
      pushEvent({ stage: "Scenario DSL", status: response?.chain?.parsed?.scenarioJson ? "success" : "error", title: response?.chain?.parsed?.scenarioJson ? "Json Parse Ok" : "Json Parse Failed" }, d); d += step;
      pushEvent({
        stage: "WireMock",
        status: mockCoverageOk ? "success" : "warn",
        title: mockCoverageOk ? "Coverage Check" : "Mocks Parse Empty",
        detail: `wiremock_mocks=${Number(response?.chain?.parsed?.wiremockMockCount ?? 0)} | attached_mocks=${attachedMockCount} | coverage_ok=${mockCoverageOk}`,
        meta: {
          wiremock_mocks: Number(response?.chain?.parsed?.wiremockMockCount ?? 0),
          attached_mocks: attachedMockCount,
          coverage_ok: mockCoverageOk,
          preflight_error: preflightError || "-"
        }
      }, d); d += step;
      pushEvent({ stage: "Scenario DSL", status: response?.chain?.parsed?.scenarioJson ? "success" : "error", title: "Engine Shape Validated" }, d); d += step;
    }

    pushEvent({ stage: "UI", status: "info", title: "Progress", detail: "Running FlowTest engine validation..." }, d); d += step;
    pushEvent({ stage: "Engine Run", status: "running", title: "Started" }, d); d += step;
    if (preflightError) {
      pushEvent({
        stage: "Engine Run",
        status: "error",
        title: "Preflight Failed",
        detail: preflightError,
        meta: {
          preflight_error: preflightError,
          mock_coverage_ok: mockCoverageOk,
          attached_mock_count: attachedMockCount
        }
      }, d); d += step;
    }
    if (workflowId) {
      pushEvent({ stage: "Engine Run", status: "running", title: "Temporal Workflow Started", detail: `workflowId=${workflowId}${runId ? ` runId=${runId}` : ""}` }, d); d += step;
      pushEvent({ stage: "UI", status: "info", title: "Temporal Link Updated", detail: temporalLink }, d); d += step;
      postToWebview("temporal", { temporalLink });
    }
    let engineScenarioSuccess: boolean | null = null;
    let engineFailureStepId: string = "";
    if (response?.engine) {
      const engineBody = String(response.engine.body || "");
      const engineParsed = parseJsonSafe(engineBody);
      const engineResult = engineParsed?.result ?? engineParsed ?? {};
      const failureStepId = String(engineResult?.failureStepId ?? "");
      engineFailureStepId = failureStepId;
      const failedSteps = Number(engineResult?.failedSteps ?? 0);
      const passedSteps = Number(engineResult?.passedSteps ?? 0);
      const totalSteps = Number(engineResult?.totalSteps ?? 0);
      const engineSuccess =
        typeof engineResult?.success === "boolean"
          ? Boolean(engineResult.success)
          : (response.engine.ok && !failureStepId);
      engineScenarioSuccess = engineSuccess;
      const engineErrorText = String(engineResult?.error ?? "");
      const engineWireMock = engineResult?.wireMock ?? {};
      pushEvent({
        stage: "Engine Run",
        status: response.engine.ok ? "running" : "error",
        title: "Response Received",
        detail: `http_status=${response.engine.status} body=${engineBody.length} chars`,
        meta: {
          http_status: response.engine.status,
          response_chars: engineBody.length,
          workflow_id: workflowId || "-",
          run_id: runId || "-",
          success: engineSuccess,
          failure_step_id: failureStepId || "-",
          total_steps: Number.isFinite(totalSteps) ? totalSteps : 0,
          passed_steps: Number.isFinite(passedSteps) ? passedSteps : 0,
          failed_steps: Number.isFinite(failedSteps) ? failedSteps : 0,
          wiremock_enabled: Boolean(engineWireMock?.enabled),
          wiremock_stub_count: Number(engineWireMock?.stubCount ?? 0),
          wiremock_base_url: String(engineWireMock?.baseUrl ?? "-"),
          error_message: engineErrorText || "-"
        },
        actions: [{ label: "Engine Output", title: "Engine Output", content: engineBody }]
      }, d); d += step;
      if (!response.engine.ok || !engineSuccess) {
        pushEvent({
          stage: "Engine Run",
          status: "error",
          title: "Failure Diagnosed",
          detail: failureStepId ? `failure_step_id=${failureStepId}` : "Engine reported failure",
          meta: {
            http_status: response.engine.status,
            failure_step_id: failureStepId || "-",
            failed_steps: Number.isFinite(failedSteps) ? failedSteps : 0,
            total_steps: Number.isFinite(totalSteps) ? totalSteps : 0,
            error_message: engineErrorText || "-"
          }
        }, d); d += step;
      }
    }
    if (wiremockBaseUrl !== "-" || allureResultsPath !== "-" || allureReportPath !== "-" || allureGenerateCommand !== "-") {
      pushEvent({
        stage: "Engine Run",
        status: "info",
        title: "Allure Metadata Loaded",
        detail: [allureResultsPath !== "-" ? `results=${allureResultsPath}` : "", allureReportPath !== "-" ? `report=${allureReportPath}` : ""].filter(Boolean).join(" ")
      }, d); d += step;
    }
    if (response?.engine?.skipped) {
      pushEvent({
        stage: "Engine Run",
        status: "warn",
        title: "Skipped",
        detail: String(response?.engine?.reason || "Engine was skipped"),
        meta: {
          skipped: true,
          reason: String(response?.engine?.reason || "-"),
          preflight_error: preflightError || "-"
        }
      }, d); d += step;
    } else {
      pushEvent({
        stage: "Engine Run",
        status: engineScenarioSuccess ? "success" : "error",
        title: "Completed",
        meta: {
          engine_ok: Boolean(engineScenarioSuccess),
          http_status: Number(response?.engine?.status ?? 0),
          workflow_id: workflowId || "-",
          run_id: runId || "-",
          failure_step_id: engineFailureStepId || "-"
        },
        actions: response?.engine?.body
          ? [{ label: "Engine Output", title: "Engine Output", content: String(response.engine.body) }]
          : undefined
      }, d); d += step;
    }
    pushEvent({ stage: "UI", status: "info", title: "Engine Section Rendered" }, d); d += step;

    pushEvent({ stage: "ARTIFACTS", status: "running", title: "Persist Started", detail: outputPath }, d); d += step;
    pushEvent({ stage: "ARTIFACTS", status: "info", title: "Persisted", detail: outputPath }, d); d += step;
    pushEvent({ stage: "UI", status: "info", title: "Artifacts Section Rendered" }, d); d += step;

    pushEvent({ stage: "ALLURE", status: "running", title: "Generate Started" }, d); d += step;
    pushEvent({
      stage: "ALLURE",
      status: response?.allure?.ok ? (response?.allure?.serverReady ? "success" : "running") : "warn",
      title: response?.allure?.ok
        ? (response?.allure?.serverReady ? "Generate Completed" : "Server Booting")
        : "Generate Failed",
      detail: response?.allure?.ok
        ? String(
            response?.allure?.serverReady
              ? (response?.allure?.url || response?.allure?.reportPath || "opened")
              : "Allure is starting, report URL will be reachable shortly..."
          )
        : String(response?.allure?.error || ""),
      meta: {
        allure_ok: Boolean(response?.allure?.ok),
        report_path: String(response?.allure?.reportPath || "-"),
        report_dir: String(response?.allure?.reportDir || "-"),
        allure_url: String(response?.allure?.url || "-"),
        command: String(response?.allure?.command || allureGenerateCommand || "-"),
        error_message: String(response?.allure?.error || "-"),
        skipped: Boolean(response?.allure?.skipped),
        server_started: Boolean(response?.allure?.serverStarted),
        server_ready: Boolean(response?.allure?.serverReady),
        preclean_results_dir: String(response?.allure?.preClean?.resultsDir || "-"),
        preclean_report_dir: String(response?.allure?.preClean?.reportDir || "-"),
        preclean_ok: Boolean(response?.allure?.preClean?.cleaned),
        preclean_error: String(response?.allure?.preClean?.error || "-")
      }
    }, d); d += step;

    const finalizeRun = (status: "Completed" | "Failed", detail: string) => {
      pushEvent({
        stage: "RUN",
        status: status === "Completed" ? "success" : "error",
        title: status,
        meta: {
          engine_ok: status === "Completed",
          preflight_error: preflightError || "-",
          run_name: runName,
          orchestration_id: orchestrationId
        }
      }, 0);
      postToWebview("summary", { status, detail });
      pushEvent({ stage: "UI", status: "info", title: "Verbose Section Rendered" }, 0);
      pushEvent({ stage: "UI", status: "info", title: "Evidence Summary Rendered" }, 0);
    };

    const finalOk = !preflightError && !!engineScenarioSuccess && !engineFailureStepId;
    const finalStatus: "Completed" | "Failed" = finalOk ? "Completed" : "Failed";
    const finalDetail = finalOk ? "Engine scenarios: 1/1 passed" : (preflightError || "Engine scenarios failed");

    if (response?.allure?.ok && allureUrl) {
      if (response?.allure?.serverReady) {
        pushEvent({
          stage: "ALLURE",
          status: "success",
          title: "Server Ready",
          detail: allureUrl,
          meta: {
            allure_url: allureUrl,
            ready_wait_ms: Number(response?.allure?.readyWaitMs ?? 0),
            ready_timeout_ms: Number(response?.allure?.readyTimeoutMs ?? 0)
          }
        }, 0);
        postToWebview("summary", { status: finalStatus, detail: `${finalDetail} | Allure ready` });
        window.open(allureUrl, "_blank", "noopener,noreferrer");
      } else {
        const waitedMs = Number(response?.allure?.readyWaitMs ?? 0);
        const waited = mmss(Math.max(0, Math.floor(waitedMs / 1000)));
        pushEvent({
          stage: "ALLURE",
          status: "warn",
          title: "Server Not Reachable",
          detail: `Timed out after ${waited} waiting for ${allureUrl}`,
          meta: {
            allure_url: allureUrl,
            ready_wait_ms: waitedMs,
            ready_timeout_ms: Number(response?.allure?.readyTimeoutMs ?? 0)
          }
        }, 0);
        postToWebview("summary", { status: finalStatus, detail: `${finalDetail} | Allure not reachable after ${waited}` });
      }
      finalizeRun(finalStatus, finalDetail);
    } else {
      finalizeRun(finalStatus, finalDetail);
    }

    postToWebview("meta", {
      outputPath,
      wiremockBaseUrl,
      allureResultsPath,
      allureReportPath,
      allureGenerateCommand,
      wiremockAdminMappingsUrl,
      wiremockOpenApiUrl,
      aiGeneratedDataUrl,
      apiExplorerUrl
    });
  };

  const runFake = (runName: string, mode: "multi upload" | "row mode", successCount: number, failureCount: number) => {
    const fixture = createFakeRunFixture();
    postToWebview("init", {
      runName,
      orchestrationId: "023c6646-1811-4d0c-aa17-9c118a87c2d7",
      temporalLink: fixture.temporalLink,
      successCount,
      failureCount,
      intakeMode: mode,
      allowFake: true
    });
    postToWebview("summary", { status: "Running", detail: fixture.summaryStart });
    fixture.events.forEach((ev, idx) => {
      const t = window.setTimeout(() => {
        const now = new Date();
        postToWebview("event", {
          time: ev.time || hhmmss(now),
          stage: ev.stage,
          status: ev.status,
          title: ev.title,
          detail: ev.detail,
          meta: ev.meta,
          actions: ev.actions
        });
        if (idx === fixture.events.length - 1) {
          postToWebview("meta", {
            outputPath: "/Users/salilvnair/workspace/rough/.flowtest-runs/fake-flowtest-run",
            wiremockBaseUrl: "http://localhost:51684",
            allureResultsPath: "/Users/salilvnair/workspace/git/salilvnair/flowtest-workspace/flowtest-parent/allure-results",
            allureReportPath: "/Users/salilvnair/workspace/git/salilvnair/flowtest-workspace/flowtest-parent/allure-report/index.html",
            wiremockAdminMappingsUrl: "http://localhost:51684/__admin/mappings",
            wiremockOpenApiUrl: "/api/openapi/latest",
            aiGeneratedDataUrl: `${window.location.origin}/ai-generated-data`,
            apiExplorerUrl: `${window.location.origin}/api-explorer`
          });
          postToWebview("summary", { status: "Completed", detail: fixture.summaryEnd });
        }
      }, idx * fixture.intervalMs);
      timersRef.current.push(t);
    });
  };

  useEffect(() => {
    sessionRef.current += 1;
    const currentSession = sessionRef.current;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { __ftWebview?: boolean; msg?: WebviewMsg } | undefined;
      if (!data?.__ftWebview || !data.msg) return;
      const msg = data.msg;
      if (msg.type === "ready") {
        readyRef.current = true;
        flushQueue();
        return;
      }
      if (msg.type === "openExternal" && msg.url) {
        window.open(String(msg.url), "_blank", "noopener,noreferrer");
      }
    };

    window.addEventListener("message", onMessage);

    let intake: any = null;
    try {
      const raw = localStorage.getItem("flowtest:lastIntakePayload");
      intake = raw ? JSON.parse(raw) : null;
    } catch {
      intake = null;
    }
    const runName = String(intake?.runName || "flowtest-zapper-run");
    const mode = intake?.multiUpload ? "multi upload" : "row mode";
    const successCount = Array.isArray(intake?.successSamples) ? intake.successSamples.length : 11;
    const failureCount = Array.isArray(intake?.failureSamples) ? intake.failureSamples.length : 9;
    const fake = String(searchParams?.get("mode") || "").toLowerCase() === "fake";

    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    clearTimers();
    renderedRealRef.current = false;
    if (fake) {
      runFake(runName, mode, successCount, failureCount);
    } else {
      const tryRenderReal = () => {
        if (renderedRealRef.current) return true;
        try {
          const err = localStorage.getItem("flowtest:lastIntakeError");
          if (err) {
            renderedRealRef.current = true;
            postToWebview("init", {
              runName,
              orchestrationId: "failed",
              temporalLink: "http://localhost:8233/namespaces/default/workflows",
              successCount,
              failureCount,
              intakeMode: mode,
              allowFake: false
            });
            postToWebview("event", { time: hhmmss(new Date()), stage: "RUN", status: "error", title: "Failed", detail: err });
            postToWebview("summary", { status: "Failed", detail: err });
            return true;
          }
          const raw = localStorage.getItem("flowtest:lastIntakeResponse");
          if (!raw) return false;
          const response = JSON.parse(raw);
          renderedRealRef.current = true;
          runRealFromResponse(intake, response, currentSession);
          return true;
        } catch {
          return false;
        }
      };

      if (!tryRenderReal()) {
        if (intake) {
          void startStreamingRun(intake, currentSession, runName, mode, successCount, failureCount);
        } else {
          postToWebview("init", {
            runName,
            orchestrationId: "waiting",
            temporalLink: "http://localhost:8233/namespaces/default/workflows",
            successCount,
            failureCount,
            intakeMode: mode,
            allowFake: false
          });
          postToWebview("summary", { status: "Running", detail: "Waiting for intake payload from Start form..." });
          pushEvent({ stage: "RUN", status: "running", title: "Started" }, 60);
          pushEvent({ stage: "UI", status: "info", title: "Status Panel Initialized" }, 180);
          pushEvent({
            stage: "Intake",
            status: "warn",
            title: "Waiting",
            detail: "No intake payload found yet. Start from intake form."
          }, 260);
        }
      }
    }

    return () => {
      sessionRef.current += 1;
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
      window.removeEventListener("message", onMessage);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      onLoad={applyThemeVars}
      title="FlowTest Run Center"
      style={{ border: "none", width: "100%", height: "100vh", display: "block" }}
      sandbox="allow-same-origin allow-scripts allow-downloads allow-modals"
    />
  );
}
