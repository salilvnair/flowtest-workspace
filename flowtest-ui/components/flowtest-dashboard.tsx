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

export function FlowtestDashboard() {
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Array<{ type: string; payload: any }>>([]);
  const timersRef = useRef<number[]>([]);

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
</style>`;

    let html = STATUS_PANEL_TEMPLATE.replace(
      "if (fb) fb.style.display = 'none';",
      "if (fb) fb.style.display = (p && p.allowFake) ? '' : 'none';"
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
            allureReportPath: "/Users/salilvnair/workspace/git/salilvnair/flowtest-workspace/flowtest-parent/allure-report/index.html"
          });
          postToWebview("summary", { status: "Completed", detail: fixture.summaryEnd });
        }
      }, idx * fixture.intervalMs);
      timersRef.current.push(t);
    });
  };

  useEffect(() => {
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
    const fake = String(searchParams.get("mode") || "").toLowerCase() === "fake";

    clearTimers();
    if (fake) {
      runFake(runName, mode, successCount, failureCount);
    } else {
      postToWebview("init", {
        runName,
        orchestrationId: "c5ddce25-87c7-486e-85c7-6320c6001e50",
        temporalLink: "http://localhost:8233/namespaces/default/workflows",
        successCount,
        failureCount,
        intakeMode: mode,
        allowFake: true
      });
      postToWebview("event", {
        time: hhmmss(new Date()),
        stage: "UI",
        status: "info",
        title: "Webview Ready",
        detail: "Timeline renderer initialized."
      });
      postToWebview("summary", {
        status: "Completed",
        detail: "Engine scenarios: 1/1 passed"
      });
    }

    return () => {
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
      sandbox="allow-same-origin allow-scripts allow-downloads"
    />
  );
}
