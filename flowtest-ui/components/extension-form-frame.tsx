"use client";

import { useEffect, useMemo, useRef } from "react";
import vscodeThemeVars from "@/lib/vscode-theme-vars.json";

type MessageHandler = (msg: { type?: string; payload?: any; [key: string]: any }) => void;

export function ExtensionFormFrame({
  template,
  onMessage
}: {
  template: string;
  onMessage: MessageHandler;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const applyThemeVars = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    const root = doc.documentElement;
    const vars = vscodeThemeVars as Record<string, string>;
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
    const isRunCenter = template.includes("FlowTest Run Center");
    const fallbackStyle = `
<style id="ft-vscode-fallback-vars" nonce="form-nonce">
  :root {
    --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --vscode-font-size: 13px;
    --vscode-font-weight: normal;
    --vscode-editor-font-family: "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --vscode-editor-font-size: 12px;
    --vscode-editor-font-weight: normal;

    --vscode-foreground: #d4d4d4;
    --vscode-errorForeground: #f48771;
    --vscode-descriptionForeground: rgba(212, 212, 212, 0.72);
    --vscode-icon-foreground: #c5c5c5;
    --vscode-focusBorder: #3794ff;

    --vscode-editor-background: ${palette.bg};
    --vscode-editor-foreground: ${palette.fg};
    --vscode-editorWidget-background: ${palette.widget};

    --vscode-panel-border: ${palette.panel};
    --vscode-list-hoverBackground: rgba(124, 160, 219, 0.14);

    --vscode-input-background: #2a3242;
    --vscode-input-foreground: #d8dee9;
    --vscode-input-border: #3d4860;
    --vscode-input-placeholderForeground: rgba(216, 222, 233, 0.52);

    --vscode-button-background: #2f6feb;
    --vscode-button-hoverBackground: #3b7bff;
    --vscode-button-foreground: #ffffff;
    --vscode-button-border: transparent;

    --vscode-charts-green: ${palette.ok};
    --vscode-charts-red: ${palette.err};
    --vscode-charts-blue: ${palette.info};
    --vscode-charts-yellow: ${palette.warn};

    --vscode-testing-iconPassed: #89d185;
    --vscode-testing-iconFailed: #f14c4c;
    --vscode-testing-iconQueued: #e2c08d;
  }

  body.vscode-dark,
  body {
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
  }
  ${isRunCenter ? `
  body.vscode-dark {
    background:
      radial-gradient(860px 420px at -12% -20%, color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent), transparent 64%),
      radial-gradient(940px 520px at 115% 118%, color-mix(in srgb, var(--vscode-charts-green) 20%, transparent), transparent 67%),
      var(--vscode-editor-background) !important;
    color: var(--vscode-editor-foreground) !important;
  }` : ""}
</style>`;
    const apiShim = `
<script nonce="form-nonce">
window.acquireVsCodeApi = function(){
  return {
    postMessage: function(msg){ try { window.parent.postMessage({ __ftWebview: true, msg: msg }, '*'); } catch(e) {} },
    setState: function(){},
    getState: function(){ return null; }
  };
};
</script>`;

    let html = template;
    html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${fallbackStyle}${apiShim}`);
    }
    if (html.includes("<body") && !html.includes("class=\"vscode-dark\"")) {
      html = html.replace("<body", "<body class=\"vscode-dark\"");
    }
    if (isRunCenter && html.includes("</head>")) {
      const lateRunCenterTheme = `
<style nonce="form-nonce" id="ft-run-center-late-theme">
  :root{
    --bg:var(--vscode-editor-background) !important;
    --fg:var(--vscode-editor-foreground) !important;
    --muted:var(--vscode-descriptionForeground) !important;
    --border:var(--vscode-panel-border) !important;
    --card:color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent) !important;
    --ok:var(--vscode-charts-green) !important;
    --warn:var(--vscode-charts-yellow) !important;
    --err:var(--vscode-charts-red) !important;
    --info:var(--vscode-charts-blue) !important;
  }
  body.vscode-dark{
    background:
      radial-gradient(860px 420px at -12% -20%, color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent), transparent 64%),
      radial-gradient(940px 520px at 115% 118%, color-mix(in srgb, var(--vscode-charts-green) 20%, transparent), transparent 67%),
      var(--vscode-editor-background) !important;
    color:${palette.fg} !important;
  }
  .section{
    background:linear-gradient(170deg, color-mix(in srgb, var(--vscode-editorWidget-background) 94%, transparent), color-mix(in srgb, var(--vscode-editor-background) 96%, transparent)) !important;
    border-color:var(--vscode-panel-border) !important;
  }
  .sectionHead,.summary,.runFooterDock{
    border-color:var(--vscode-panel-border) !important;
    color:var(--vscode-descriptionForeground) !important;
  }
  .hero,.metaChip,.tile,.runMetaDockItem,.followToggle,.testBtn,.chip{
    background:color-mix(in srgb, var(--vscode-editorWidget-background) 90%, transparent) !important;
    border-color:var(--vscode-panel-border) !important;
    color:var(--vscode-editor-foreground) !important;
  }
  h1,
  .hero h1,
  .sectionTitle,
  .sectionHead,
  .sectionHeadLeft,
  .sectionHeadLeft *,
  .metaChip .mv,
  .metaChip .mv * ,
  .metaValueText,
  .metaChip .mk,
  .tile .v,
  .tile .k,
  #runMeta,
  #runMeta *{
    color:${palette.fg} !important;
  }
  .metaChip .mk,
  .tile .k,
  .sectionHead{
    color:${palette.muted} !important;
  }
  .event{
    background:color-mix(in srgb, var(--vscode-editorWidget-background) 86%, transparent) !important;
    border-color:var(--vscode-panel-border) !important;
  }
  .eventBody,.detail,.time{
    color:${palette.muted} !important;
  }
  .expandBtn,.collapseBtn{
    background:color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent) !important;
    border-color:var(--vscode-panel-border) !important;
    color:var(--vscode-descriptionForeground) !important;
  }
  .expandBtn:hover,.collapseBtn:hover{
    border-color:var(--vscode-focusBorder) !important;
    color:var(--vscode-editor-foreground) !important;
  }
  .stageTag,.statusPill,.controlChip,.metaChip,.tile{
    border-color:var(--vscode-panel-border) !important;
  }
</style>`;
      html = html.replace("</head>", `${lateRunCenterTheme}</head>`);
    }
    return html;
  }, [template]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { __ftWebview?: boolean; msg?: any } | undefined;
      if (!data?.__ftWebview || !data.msg) return;
      onMessage(data.msg);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      onLoad={applyThemeVars}
      title="FlowTest Form"
      style={{ border: "none", width: "100%", height: "100vh", display: "block" }}
      sandbox="allow-same-origin allow-scripts allow-downloads allow-modals"
    />
  );
}
