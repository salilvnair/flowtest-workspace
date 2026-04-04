import * as vscode from "vscode";

type RunInitPayload = {
  runName: string;
  orchestrationId: string;
  temporalLink: string;
  successCount: number;
  failureCount: number;
  intakeMode: string;
  outputPath?: string;
  wiremockBaseUrl?: string;
};

type EventPayload = {
  time: string;
  stage: string;
  status: "running" | "success" | "warn" | "error" | "info";
  title: string;
  detail?: string;
  meta?: Record<string, string | number | boolean>;
  actions?: Array<{
    label: string;
    title: string;
    content: string;
  }>;
};

type SummaryPayload = {
  status: string;
  detail?: string;
};

type TemporalPayload = {
  temporalLink: string;
  workflowId?: string;
  runId?: string;
};

type MetaPatchPayload = {
  outputPath?: string;
  allureResultsPath?: string;
  allureReportPath?: string;
  allureGenerateCommand?: string;
  wiremockBaseUrl?: string;
};

export class FlowtestStatusPanel {
  private static current: FlowtestStatusPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private webviewReady = false;
  private fallbackMode = false;
  private runInit: RunInitPayload | null = null;
  private summary: SummaryPayload | null = null;
  private temporal: TemporalPayload | null = null;
  private meta: MetaPatchPayload = {};
  private readonly events: EventPayload[] = [];

  static createOrShow(extensionUri: vscode.Uri): FlowtestStatusPanel {
    if (FlowtestStatusPanel.current) {
      FlowtestStatusPanel.current.panel.dispose();
      FlowtestStatusPanel.current = undefined;
    }

    const panel = vscode.window.createWebviewPanel(
      "flowtestRunStatus",
      "FlowTest Run Center",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    FlowtestStatusPanel.current = new FlowtestStatusPanel(panel, extensionUri);
    return FlowtestStatusPanel.current;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, "images", "flowtest_bot.svg");
    this.panel.webview.onDidReceiveMessage((msg) => {
      console.log("[FlowTestStatusPanel] from webview:", msg);
      if (msg?.type === "webviewError") {
        console.error("[FlowTestStatusPanel] webview runtime error:", msg?.payload);
        return;
      }
      if (msg?.type === "ready") {
        this.webviewReady = true;
        console.log("[FlowTestStatusPanel] webview ready -> flushState");
        this.flushState();
        return;
      }
      if (msg?.type === "openExternal") {
        const url = String(msg?.url || "").trim();
        if (!url) {
          return;
        }
        void vscode.env.openExternal(vscode.Uri.parse(url));
      }
    });
    const html = this.getHtml();
    console.log("[FlowTestStatusPanel] set main html, len=", html.length);
    this.panel.webview.html = html;
    setTimeout(() => {
      if (!this.webviewReady) {
        console.error("[FlowTestStatusPanel] no ready handshake; switching to fallback UI");
        this.switchToFallbackUi();
      }
    }, 5000);
    this.panel.onDidDispose(() => {
      if (FlowtestStatusPanel.current === this) {
        FlowtestStatusPanel.current = undefined;
      }
    });
  }

  initRun(payload: RunInitPayload): void {
    this.runInit = payload;
    this.postNow("init", payload);
  }

  pushEvent(payload: EventPayload): void {
    this.events.push(payload);
    this.postNow("event", payload);
  }

  setSummary(payload: SummaryPayload): void {
    this.summary = payload;
    this.postNow("summary", payload);
  }

  updateTemporal(payload: TemporalPayload): void {
    this.temporal = payload;
    this.postNow("temporal", payload);
  }

  updateMeta(payload: MetaPatchPayload): void {
    this.meta = { ...this.meta, ...payload };
    this.postNow("meta", payload);
  }

  private postNow(type: string, payload: unknown): void {
    console.log("[FlowTestStatusPanel] postMessage ->", type);
    this.panel.webview.postMessage({ type, payload });
  }

  private flushState(): void {
    if (!this.webviewReady) {
      console.log("[FlowTestStatusPanel] flushState skipped (not ready)");
      return;
    }
    console.log(
      "[FlowTestStatusPanel] flushState",
      JSON.stringify({
        hasInit: Boolean(this.runInit),
        hasTemporal: Boolean(this.temporal),
        metaKeys: Object.keys(this.meta ?? {}).length,
        events: this.events.length,
        hasSummary: Boolean(this.summary)
      })
    );
    if (this.runInit) {
      this.postNow("init", this.runInit);
    }
    if (this.temporal) {
      this.postNow("temporal", this.temporal);
    }
    if (Object.keys(this.meta).length > 0) {
      this.postNow("meta", this.meta);
    }
    for (const ev of this.events) {
      this.postNow("event", ev);
    }
    if (this.summary) {
      this.postNow("summary", this.summary);
    }
  }

  private switchToFallbackUi(): void {
    if (this.fallbackMode) {
      return;
    }
    this.fallbackMode = true;
    this.webviewReady = false;
    this.panel.webview.html = this.getFallbackHtml();
  }

  private getHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground, rgba(127,127,127,0.85));
      --border: color-mix(in srgb, var(--vscode-panel-border, rgba(127,127,127,0.35)) 78%, transparent);
      --card: color-mix(in srgb, var(--vscode-editorWidget-background, rgba(127,127,127,0.04)) 90%, transparent);
      --ok: var(--vscode-testing-iconPassed, #89d185);
      --warn: var(--vscode-testing-iconQueued, #e2c08d);
      --err: var(--vscode-testing-iconFailed, #f14c4c);
      --info: var(--vscode-charts-blue, #3794ff);
      --shadow: 0 14px 30px rgba(0,0,0,0.22);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--fg);
      background:
        radial-gradient(800px 420px at -10% -20%, color-mix(in srgb, var(--info) 14%, transparent), transparent 65%),
        radial-gradient(900px 500px at 110% 120%, color-mix(in srgb, var(--ok) 10%, transparent), transparent 65%),
        var(--bg);
      font-size: 12px;
      line-height: 1.4;
      padding: 14px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panelStack { margin-top: 12px; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
    .hero { padding: 12px; height: 100%; overflow: auto; }
    h1 { margin: 0; font-size: 16px; font-weight: 900; letter-spacing: 0.2px; }
    .chip { border: 1px solid var(--border); border-radius: 999px; padding: 3px 9px; font-size: 11px; color: var(--muted); background: color-mix(in srgb, var(--card) 82%, transparent); }
    .metaRich { margin-top: 8px; display: flex; flex-direction: column; gap: 7px; }
    .metaChip { border: 1px solid var(--border); border-radius: 10px; padding: 7px 8px; background: linear-gradient(120deg, color-mix(in srgb, var(--card) 90%, transparent), color-mix(in srgb, var(--bg) 95%, transparent)); width: 100%; }
    .metaChip .mk { display: block; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.35px; margin-bottom: 2px; font-weight: 800; }
    .metaChip .mv { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--fg); font-weight: 700; white-space: normal; word-break: break-word; }
    .metaValueText { min-width: 0; overflow-wrap: anywhere; }
    .metaValueLink { color: #9fd1ff; text-decoration: none; border-bottom: 1px dashed color-mix(in srgb, #9fd1ff 45%, transparent); }
    .metaValueLink:hover { text-decoration: underline; }
    .metaCopyBtn {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: #9fd1ff;
      cursor: pointer;
      padding: 0;
      width: 14px;
      height: 14px;
    }
    .metaCopyBtn svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .metaCopyBtn:hover { color: #b9e0ff; }
    .metaCopyBtn .metaCheck {
      display: none;
      transform: scale(0.65);
    }
    .metaCopyBtn.copied .metaCopy {
      display: none;
    }
    .metaCopyBtn.copied .metaCheck {
      display: inline;
      transform: scale(1);
    }
    .stats { margin-top: 10px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
    .tile { border: 1px solid var(--border); border-radius: 10px; padding: 8px; background: color-mix(in srgb, var(--card) 86%, transparent); }
    .tile.ok { background: linear-gradient(140deg, color-mix(in srgb, #9ef0b7 14%, transparent), color-mix(in srgb, var(--card) 90%, transparent)); }
    .tile.bad { background: linear-gradient(140deg, color-mix(in srgb, #ff9db7 13%, transparent), color-mix(in srgb, var(--card) 90%, transparent)); }
    .tile.mode { background: linear-gradient(140deg, color-mix(in srgb, #9fd1ff 13%, transparent), color-mix(in srgb, var(--card) 90%, transparent)); }
    .tile .k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
    .tile .v { margin-top: 3px; font-size: 15px; font-weight: 900; }
    .tile.ok .v { color: var(--ok); }
    .tile.bad .v { color: var(--err); }
    .tile.mode .v { color: var(--info); text-transform: capitalize; }
    .runFooterDock {
      flex: 0 0 auto;
      padding: 8px 12px 10px;
      border-top: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
      background: linear-gradient(180deg, color-mix(in srgb, var(--card) 72%, transparent), color-mix(in srgb, var(--bg) 96%, transparent));
      box-shadow: 0 -6px 16px rgba(0,0,0,0.14) inset;
      display: grid;
      gap: 8px;
    }
    .runFooterDock .stats { margin-top: 0; }
    .runMetaDockWrap {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 12px;
      z-index: 14;
      display: none;
      align-items: flex-end;
      justify-content: center;
      gap: 8px;
      pointer-events: none;
    }
    .runMetaDockWrap.show { display: flex; }
    .runMetaDock {
      border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
      border-radius: 11px;
      padding: 8px;
      background: color-mix(in srgb, var(--card) 90%, #1f252d);
      box-shadow: 0 8px 20px rgba(0,0,0,0.24);
      min-width: min(760px, calc(100vw - 32px));
      transition: opacity 280ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1), max-width 320ms ease;
      transform-origin: center bottom;
      pointer-events: none;
    }
    .runMetaDockWrap.show .runMetaDock { pointer-events: auto; }
    .runMetaDockWrap.collapsed .runMetaDock {
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      pointer-events: none;
    }
    .runMetaDockHead {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 7px;
      cursor: grab;
      user-select: none;
    }
    .runMetaDockWrap.dragging .runMetaDockHead { cursor: grabbing; }
    .runMetaDockTitle {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.32px;
      color: #b8c7e8;
      font-weight: 800;
    }
    .runMetaDockClose {
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      border-radius: 999px;
      min-width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, #182338 84%, transparent);
      color: #b9d8ff;
      cursor: pointer;
      transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 140ms ease;
    }
    .runMetaDockClose:hover {
      border-color: color-mix(in srgb, var(--focus) 45%, var(--border));
      background: color-mix(in srgb, var(--focus) 22%, #182338);
      color: #d7ebff;
    }
    .runMetaDockClose:active { transform: scale(0.96); }
    .runMetaDockClose svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .runMetaDockLauncher {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      position: fixed;
      right: 16px;
      bottom: 12px;
      z-index: 15;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      background: linear-gradient(145deg, color-mix(in srgb, #9fd1ff 38%, #1a253c), color-mix(in srgb, #111929 92%, black));
      color: #9fd1ff;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transform: translateX(0) scale(0.86);
      transition: opacity 240ms ease, transform 280ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease;
    }
    .runMetaDockLauncher.show {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(0) scale(1);
    }
    .runMetaDockLauncher:hover { border-color: color-mix(in srgb, var(--focus) 45%, var(--border)); }
    .runMetaDockLauncher svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .runMetaDockGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }
    .runMetaDockItem {
      border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
      border-radius: 9px;
      padding: 6px 7px;
      background: color-mix(in srgb, var(--card) 86%, #242a33);
      min-width: 0;
    }
    .runMetaDockKey {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.32px;
      color: #aebddc;
      margin-bottom: 2px;
      font-weight: 800;
    }
    .runMetaDockKey svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.92;
      flex: 0 0 auto;
    }
    .runMetaDockVal {
      font-size: 11px;
      color: #e3ecff;
      word-break: break-word;
      line-height: 1.35;
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .runMetaDockValText {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .runMetaDockVal a {
      color: #9fd1ff;
      text-decoration: none;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .runMetaDockVal a:hover { text-decoration: underline; }
    @media (max-width: 860px) {
      .runFooterDock .stats { grid-template-columns: 1fr; }
      .runMetaDockGrid { grid-template-columns: 1fr; }
      .runMetaDock { min-width: 0; width: 100%; }
    }
    .section { border: 1px solid var(--border); border-radius: 12px; background: color-mix(in srgb, var(--card) 88%, transparent); box-shadow: var(--shadow); overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
    .section.grow { flex: 1 1 auto; min-height: 0; }
    .runSection { flex: 0 0 auto; overflow: hidden; }
    .runSection .sectionBody {
      max-height: 52vh;
      overflow: hidden;
      transition: max-height 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease;
      justify-content: flex-start;
    }
    .runSection.grow .sectionBody { max-height: none; }
    .runSection .hero {
      flex: 0 0 auto;
      min-height: auto;
      height: auto;
      overflow: visible;
      padding-bottom: 6px;
    }
    .timelineSection { flex: 1 1 auto; min-height: 280px; }
    .timelineSection.collapsed { min-height: 0; flex: 0 0 auto; }
    .resizeDivider {
      height: 10px;
      margin: 0 4px;
      border-radius: 999px;
      cursor: row-resize;
      background: linear-gradient(to bottom, transparent 38%, color-mix(in srgb, var(--border) 68%, transparent) 38%, color-mix(in srgb, var(--border) 68%, transparent) 62%, transparent 62%);
      transition: background 150ms ease, box-shadow 150ms ease;
      flex: 0 0 auto;
    }
    .resizeDivider:hover,
    .resizeDivider.dragging {
      background: linear-gradient(to bottom, transparent 35%, color-mix(in srgb, var(--info) 78%, transparent) 35%, color-mix(in srgb, var(--info) 78%, transparent) 65%, transparent 65%);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--info) 50%, transparent) inset;
    }
    .sectionBody {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: max-height 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease, transform 300ms ease;
      transform-origin: top center;
    }
    .section.collapsed .sectionBody {
      max-height: 0;
      opacity: 0;
      transform: translateY(-4px);
      pointer-events: none;
    }
    .sectionHead { padding: 9px 10px; border-bottom: 1px solid var(--border); font-size: 11px; letter-spacing: 0.4px; text-transform: uppercase; font-weight: 900; color: var(--muted); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sectionHeadLeft, .sectionHeadRight { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .collapseBtn, .expandBtn {
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      border-radius: 999px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, transparent), color-mix(in srgb, var(--bg) 96%, transparent));
      color: color-mix(in srgb, var(--fg) 70%, var(--muted));
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 1px 0 color-mix(in srgb, white 10%, transparent) inset, 0 2px 6px rgba(0,0,0,0.14);
      transition: border-color 220ms ease, background 220ms ease, color 220ms ease, transform 180ms ease, box-shadow 220ms ease;
    }
    .collapseBtn {
      min-width: 24px;
      height: 24px;
      padding: 0 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .expandBtn {
      padding: 2px 7px;
      min-width: 24px;
      height: 22px;
    }
    .collapseBtn:hover, .expandBtn:hover {
      color: color-mix(in srgb, var(--fg) 92%, transparent);
      border-color: color-mix(in srgb, var(--focus) 45%, var(--border));
      background: linear-gradient(180deg, color-mix(in srgb, var(--focus) 12%, var(--card)), color-mix(in srgb, var(--bg) 94%, transparent));
      box-shadow: 0 1px 0 color-mix(in srgb, white 14%, transparent) inset, 0 3px 10px rgba(0,0,0,0.2);
    }
    .collapseBtn:active, .expandBtn:active {
      transform: scale(0.96);
    }
    .collapseBtn svg, .expandBtn svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
      transform-origin: 50% 50%;
    }
    .collapseBtn.is-collapsed svg, .expandBtn.is-collapsed svg { transform: rotate(180deg); }
    .followToggle { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid var(--border); border-radius: 999px; font-size: 10px; color: var(--muted); background: color-mix(in srgb, var(--card) 82%, transparent); text-transform: none; letter-spacing: 0; font-weight: 700; }
    .followToggle input { accent-color: var(--info); width: 12px; height: 12px; }
    .testBtn {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      color: #9fd1ff;
      background: color-mix(in srgb, #9fd1ff 14%, transparent);
      cursor: default;
      pointer-events: none;
      user-select: none;
      opacity: 0.92;
    }
    .timeline { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
    .event { border: 1px solid var(--border); border-radius: 10px; padding: 8px; background: color-mix(in srgb, var(--card) 84%, transparent); display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: flex-start; }
    .eventBody {
      max-height: 340px;
      overflow: hidden;
      transition: max-height 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 260ms ease;
      transform-origin: top center;
    }
    .event.compact .eventBody {
      max-height: 0;
      opacity: 0;
      transform: translateY(-3px);
    }
    .statusPill, .controlChip, .stageTag { border: 1px solid var(--border); border-radius: 999px; font-size: 10px; line-height: 1; padding: 2px 7px; }
    .stageTag { color: var(--info); background: color-mix(in srgb, var(--info) 14%, transparent); }
    .stageTag.ui { color: #7ed8ff; background: color-mix(in srgb, #7ed8ff 22%, transparent); }
    .stageTag.intake { color: #9ef0b7; background: color-mix(in srgb, #9ef0b7 22%, transparent); }
    .stageTag.api-spec { color: #ffd27d; background: color-mix(in srgb, #ffd27d 22%, transparent); }
    .stageTag.wiremock { color: #ffb3a5; background: color-mix(in srgb, #ffb3a5 22%, transparent); }
    .stageTag.scenario-dsl { color: #c0c6ff; background: color-mix(in srgb, #c0c6ff 22%, transparent); }
    .stageTag.engine-run { color: #ff9db7; background: color-mix(in srgb, #ff9db7 22%, transparent); }
    .stageTag.artifacts { color: #9be7ff; background: color-mix(in srgb, #9be7ff 22%, transparent); }
    .statusPill { color: var(--muted); background: color-mix(in srgb, var(--card) 84%, transparent); }
    .statusPill.run { color: #9fd1ff; border-color: color-mix(in srgb, #9fd1ff 46%, var(--border)); background: color-mix(in srgb, #9fd1ff 16%, transparent); }
    .statusPill.ok { color: #9ef0b7; border-color: color-mix(in srgb, #9ef0b7 46%, var(--border)); background: color-mix(in srgb, #9ef0b7 16%, transparent); }
    .statusPill.warn { color: #ffd27d; border-color: color-mix(in srgb, #ffd27d 46%, var(--border)); background: color-mix(in srgb, #ffd27d 16%, transparent); }
    .statusPill.err { color: #ff9db7; border-color: color-mix(in srgb, #ff9db7 46%, var(--border)); background: color-mix(in srgb, #ff9db7 16%, transparent); }
    .controlChip.llm { color: #c9b7ff; }
    .controlChip.java { color: #ffb79e; }
    .controlChip.vscode { color: #8fd3ff; }
    .dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; background: var(--info); box-shadow: 0 0 0 3px color-mix(in srgb, var(--info) 20%, transparent); }
    .rowTop { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .time { font-family: var(--vscode-editor-font-family, monospace); color: var(--muted); font-size: 11px; }
    .titleWrap { display: inline-flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; }
    .title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10.5px; font-weight: 400; color: color-mix(in srgb, var(--muted) 68%, transparent); letter-spacing: 0.12px; line-height: 1.4; }
    .titleWrap .expandBtn {
      position: relative;
      z-index: 2;
      pointer-events: auto;
      flex: 0 0 auto;
    }
    .event.lowSignal .title {
      font-family: var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace);
      font-size: 11px;
      font-weight: 500;
      color: color-mix(in srgb, var(--muted) 92%, var(--fg));
      letter-spacing: 0.1px;
    }
    .event.lowSignal .time {
      font-family: var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace);
      font-size: 10px;
      color: color-mix(in srgb, var(--muted) 88%, transparent);
    }
    .event.lowSignal .dot {
      width: 7px;
      height: 7px;
      margin-top: 6px;
      background: color-mix(in srgb, var(--muted) 70%, var(--info));
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--muted) 16%, transparent);
    }
    .event.lowSignal .detail {
      font-family: var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace);
      font-size: 11px;
      color: color-mix(in srgb, var(--muted) 95%, transparent);
    }
    .timerPill { margin-left: auto; border: 1px solid color-mix(in srgb, var(--info) 48%, var(--border)); border-radius: 999px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; color: #9fd1ff; }
    .timerPill.hidden { display: none; }
    .timerPill.done { color: #9ef0b7; }
    .timerDot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .timerPill { pointer-events: none; }
    .detail { color: color-mix(in srgb, var(--muted) 62%, transparent); margin-top: 4px; white-space: pre-wrap; word-break: break-word; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.15px; line-height: 1.45; }
    .metaTable { margin-top: 8px; border-collapse: separate; border-spacing: 0; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10px; border-radius: 8px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--border) 60%, transparent); box-shadow: 0 1px 4px rgba(0,0,0,0.18), 0 0 0 1px color-mix(in srgb, white 3%, transparent) inset; }
    .metaTable th { text-align: left; padding: 5px 10px; color: color-mix(in srgb, var(--fg) 72%, var(--muted)); background: linear-gradient(180deg, color-mix(in srgb, var(--card) 80%, #1e2430), color-mix(in srgb, var(--bg) 90%, #161b24)); font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.6px; border-bottom: 1px solid var(--border); }
    .metaTable td { padding: 4px 10px; border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent); }
    .metaTable tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--card) 30%, transparent); }
    .metaTable tbody tr:hover td { background: color-mix(in srgb, var(--info) 8%, transparent); }
    .metaTable tr:last-child td { border-bottom: none; }
    .metaTable .metaKey { color: #79c0ff; font-weight: 600; white-space: nowrap; font-size: 10px; }
    .metaTable .metaVal { color: color-mix(in srgb, var(--fg) 88%, var(--muted)); opacity: 0.88; font-family: var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace); font-size: 10px; }
    .actions { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
    .actionBtn { border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--card) 84%, transparent); color: var(--fg); font-size: 10px; line-height: 1; padding: 4px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
    .actionBtn.ai { color: #c0c6ff; border-color: color-mix(in srgb, #c0c6ff 50%, var(--border)); background: color-mix(in srgb, #c0c6ff 16%, transparent); }
    .actionBtn.file { color: #9be7ff; border-color: color-mix(in srgb, #9be7ff 50%, var(--border)); background: color-mix(in srgb, #9be7ff 16%, transparent); }
    .actionBtn.engine { color: #ffb3a5; border-color: color-mix(in srgb, #ffb3a5 50%, var(--border)); background: color-mix(in srgb, #ffb3a5 16%, transparent); }
    .summary { padding: 8px 14px 10px; border-top: 1px solid var(--border); font-size: 10.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: var(--muted); position: relative; overflow: hidden; background: var(--bg); letter-spacing: 0.15px; line-height: 1.5; }
    .summary b { color: var(--fg); font-weight: 700; }
    .summary .summaryDetail { color: color-mix(in srgb, var(--fg) 70%, var(--muted)); font-style: italic; }
    .summary.thinking .summaryProgress { display: inline; background: linear-gradient(105deg, #8a9bb5 0%, #d0d8e4 40%, #ffffff 50%, #d0d8e4 60%, #8a9bb5 100%); background-size: 200% 100%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: glossyText 2.4s ease-in-out infinite; font-weight: 600; }
    @keyframes glossyText { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .summary.done .summaryStatus { color: #9ef0b7; font-weight: 700; }
    .lastRowLabel { font-size: 10px; color: color-mix(in srgb, var(--muted) 72%, transparent); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; }
    .stateComplete { color: #9ef0b7; }
    .stateFail { color: #ff9db7; }
    .modal {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(900px 340px at 50% -20%, color-mix(in srgb, var(--info) 14%, transparent), transparent 64%),
        rgba(0, 0, 0, 0.58);
      display: none;
      padding: 18px;
      z-index: 99;
      backdrop-filter: blur(3px);
    }
    .modal.open { display: block; }
    .modalCard {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(calc(100% - 36px), 1020px);
      max-height: 84vh;
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      border-radius: 12px;
      background:
        linear-gradient(170deg, color-mix(in srgb, var(--card) 94%, #1f242c), color-mix(in srgb, var(--bg) 96%, #191f27));
      box-shadow: 0 20px 44px rgba(0,0,0,0.42), 0 1px 0 color-mix(in srgb, white 8%, transparent) inset;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      will-change: transform;
    }
    .modalHead {
      padding: 8px 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--card) 88%, transparent), color-mix(in srgb, var(--bg) 96%, transparent));
      cursor: grab;
      user-select: none;
    }
    .modalHead:active { cursor: grabbing; }
    .modalTitle { font-weight: 800; font-size: 12px; }
    .modalActions { display: inline-flex; align-items: center; gap: 6px; }
    .closeBtn { border: 1px solid var(--border); border-radius: 8px; background: color-mix(in srgb, var(--card) 86%, transparent); color: var(--fg); font-size: 11px; padding: 3px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; width: max-content; }
    .closeBtn.copy { color: #9be7ff; border-color: color-mix(in srgb, #9be7ff 50%, var(--border)); background: color-mix(in srgb, #9be7ff 16%, transparent); }
    .closeBtn.download { color: #c0c6ff; border-color: color-mix(in srgb, #c0c6ff 50%, var(--border)); background: color-mix(in srgb, #c0c6ff 16%, transparent); }
    .closeBtn.dismiss { color: #ffb3a5; border-color: color-mix(in srgb, #ffb3a5 50%, var(--border)); background: color-mix(in srgb, #ffb3a5 16%, transparent); }
    .closeBtn .btnIconWrap { position: relative; width: 12px; height: 12px; display: inline-block; }
    .closeBtn .btnIcon { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; position: absolute; inset: 0; transition: opacity 200ms ease, transform 200ms ease; }
    .closeBtn .checkGlyph { opacity: 0; transform: scale(0.6); }
    .closeBtn.copied .copyGlyph { opacity: 0; transform: scale(0.6); }
    .closeBtn.copied .checkGlyph { opacity: 1; transform: scale(1); }
    .closeBtn .btnLabel { min-width: 0; text-align: left; }
    .closeBtn.download .dlStem, .closeBtn.download .dlHead { transition: transform 260ms ease, opacity 260ms ease; transform-origin: 50% 50%; }
    .closeBtn.downloading .dlStem, .closeBtn.downloading .dlHead { transform: translateY(3px); opacity: 0.35; }
    .closeBtn.downloading .dlBase { animation: dlBasePulse 360ms ease; }
    @keyframes dlBasePulse {
      0% { opacity: 0.55; }
      50% { opacity: 1; }
      100% { opacity: 0.75; }
    }
    .modalBody {
      margin: 0;
      padding: 0;
      overflow: hidden;
      white-space: normal;
      word-break: normal;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      color: var(--fg);
      background: #0d1117;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    /* --- Postman-style tab bar --- */
    .viewTabs {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      background: color-mix(in srgb, var(--card) 60%, #11161d);
      flex: 0 0 auto;
    }
    .viewTabs .vtab {
      border: none;
      background: transparent;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      padding: 7px 12px 6px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 120ms, border-color 120ms;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .viewTabs .vtab:hover { color: var(--fg); }
    .viewTabs .vtab.active { color: #79c0ff; border-bottom-color: #79c0ff; }
    .viewTabs .vtabSpacer { flex: 1; }
    .viewTabs .vtabSearch {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, #0d1117 80%, transparent);
      padding: 2px 6px;
      margin: 2px 0;
    }
    .viewTabs .vtabSearch svg { width: 12px; height: 12px; stroke: var(--muted); fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: 0 0 auto; }
    .viewTabs .vtabSearch input {
      border: none;
      background: transparent;
      color: var(--fg);
      font-size: 11px;
      font-family: inherit;
      outline: none;
      width: 120px;
      padding: 2px 0;
    }
    .viewTabs .vtabSearch input::placeholder { color: var(--muted); }
    .viewStatus {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      flex: 0 0 auto;
    }
    .viewStatus .statusChip {
      font-size: 10px;
      color: var(--muted);
      padding: 2px 0;
    }
    /* --- view panels --- */
    .viewPanel { display: none; flex: 1 1 auto; min-height: 0; overflow: auto; background: #0d1117; }
    .viewPanel.active { display: flex; flex-direction: column; }
    /* --- Pretty view with line numbers --- */
    .prettyWrap { display: flex; flex: 1 1 auto; min-height: 0; overflow: auto; max-width: 100%; background: #0d1117; }
    .lineNums {
      flex: 0 0 auto;
      padding: 12px 0;
      text-align: right;
      user-select: none;
      color: #484f58;
      font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      font-size: 12px;
      line-height: 1.5;
      border-right: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      background: #0d1117;
      min-width: 36px;
      align-self: stretch;
    }
    .lineNums span { display: block; padding: 0 8px 0 10px; }
    .codeLang {
      display: inline-flex;
      align-items: center;
      margin: 10px 10px 0;
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.2px;
      color: #9fd1ff;
      background: color-mix(in srgb, #9fd1ff 16%, transparent);
      text-transform: uppercase;
    }
    .codeFrame {
      margin: 0;
      width: 100%;
      border-radius: 0;
      border: none;
      overflow: visible;
      background: #0d1117;
      flex: 1 1 auto;
    }
    .codeFrame code {
      display: block;
      padding: 12px;
      font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: #d4dee9;
      tab-size: 2;
      min-height: 100%;
      background: #0d1117;
    }
    .tok-key { color: #79c0ff; font-weight: 700; }
    .tok-str { color: #7ee787; }
    .tok-num { color: #f2cc8f; font-weight: 600; }
    .tok-bool { color: #d2a8ff; font-weight: 600; }
    .tok-null { color: #8b949e; font-style: italic; }
    .tok-punc { color: #8b949e; }
    mark.searchHit { background: #e2c08d44; color: inherit; border-radius: 2px; outline: 1px solid #e2c08d88; }
    /* --- Raw view --- */
    .rawView { padding: 12px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: #d4dee9; background: #0d1117; flex: 1; overflow: auto; min-height: 100%; }
    /* --- Tree view (Postman-style) --- */
    .treeView { padding: 8px 0; overflow: auto; flex: 1; background: #0d1117; }
    .treeNode { font-size: 12px; line-height: 1.6; font-family: var(--vscode-editor-font-family, monospace); }
    .treeRow { display: flex; align-items: flex-start; padding: 1px 0 1px 0; cursor: default; }
    .treeRow:hover { background: color-mix(in srgb, #79c0ff 8%, transparent); }
    .treeRow mark.searchHit { background: #e2c08d44; color: inherit; border-radius: 2px; outline: 1px solid #e2c08d88; }
    .treeRow.searchMatch { background: color-mix(in srgb, #e2c08d 10%, transparent); }
    .treeToggle {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #6e7681;
      font-size: 10px;
      user-select: none;
      transition: transform 120ms ease;
      margin-top: 2px;
    }
    .treeToggle.collapsed { transform: rotate(-90deg); }
    .treeToggle.leaf { visibility: hidden; }
    .treeKey { color: #79c0ff; font-weight: 700; margin-right: 4px; white-space: nowrap; }
    .treeColon { color: #9aa4b0; margin-right: 6px; }
    .treeVal { color: #d4dee9; }
    .treeVal.str { color: #a5d6ff; }
    .treeVal.num { color: #f2cc8f; }
    .treeVal.bool { color: #c3a6ff; }
    .treeVal.null { color: #8b949e; font-style: italic; }
    .treeBrace { color: #9aa4b0; font-weight: 400; }
    .treeType { font-size: 10px; color: #6e7681; margin-left: 6px; font-style: italic; font-weight: 400; }
    .treeChildren { padding-left: 18px; overflow: hidden; }
    .treeChildren.hidden { display: none; }
    .treeCopyBtn {
      opacity: 0;
      border: none;
      background: transparent;
      color: #9fd1ff;
      cursor: pointer;
      padding: 0 4px;
      font-size: 10px;
      transition: opacity 120ms;
    }
    .treeRow:hover .treeCopyBtn { opacity: 0.6; }
    .treeCopyBtn:hover { opacity: 1 !important; }
  </style>
</head>
<body>
  <div class="panelStack">
    <div class="section runSection" id="runCenterSection">
      <div class="sectionHead">
        <div class="sectionHeadLeft">FlowTest Run Center <button id="runCenterCollapseBtn" class="collapseBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button></div>
        <div class="sectionHeadRight"><span class="chip" id="runState">Initializing</span></div>
      </div>
      <div class="sectionBody">
        <div class="hero">
          <h1>FlowTest Run Center</h1>
          <div class="metaRich" id="runMeta"></div>
        </div>
        <div class="runFooterDock">
          <div class="stats">
            <div class="tile ok"><div class="k">Success Samples</div><div class="v" id="successCount">0</div></div>
            <div class="tile bad"><div class="k">Failure Samples</div><div class="v" id="failureCount">0</div></div>
            <div class="tile mode"><div class="k">Mode</div><div class="v" id="intakeMode">-</div></div>
          </div>
        </div>
      </div>
    </div>
    <div id="sectionDivider" class="resizeDivider" title="Drag to resize Run Center / Timeline"></div>
    <div class="section timelineSection grow" id="timelineSection">
      <div class="sectionHead">
        <div class="sectionHeadLeft">Live Timeline <button id="timelineCollapseBtn" class="collapseBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button></div>
        <div class="sectionHeadRight">
          <span id="lastRowLabel" class="lastRowLabel"></span>
          <button id="fakeRunBtn" class="testBtn" type="button" style="font-size:9px;padding:2px 8px;border-radius:999px;cursor:pointer;border:1px solid var(--border);background:color-mix(in srgb, var(--card) 84%, transparent);color:var(--muted);">Fake</button>
          <label class="followToggle"><input id="followLogs" type="checkbox" checked /> Follow logs</label>
        </div>
      </div>
      <div class="sectionBody">
        <div class="timeline" id="timeline"></div>
        <div class="summary" id="summary"><b>Status:</b> Running...</div>
      </div>
    </div>
  </div>
  <div class="runMetaDockWrap" id="runMetaDockWrap">
    <div class="runMetaDock" id="runMetaDock">
      <div class="runMetaDockHead">
        <span class="runMetaDockTitle">Execution Result</span>
        <button class="runMetaDockClose" id="runMetaDockClose" type="button" title="Hide execution result">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="runMetaDockGrid" id="runMetaDockGrid"></div>
    </div>
  </div>
  <button class="runMetaDockLauncher" id="runMetaDockLauncher" type="button" title="Show execution result">
    <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0 -12 0v3l-2 3h16l-2-3z"></path><path d="M10 18a2 2 0 0 0 4 0"></path></svg>
  </button>
  <div class="modal" id="detailModal">
    <div class="modalCard">
      <div class="modalHead">
        <div class="modalTitle" id="modalTitle">Details</div>
        <div class="modalActions">
          <button class="closeBtn copy" id="modalCopyBtn" type="button">
            <span class="btnIconWrap">
              <svg class="btnIcon copyGlyph" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1 -2 -2V4a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v1"></path></svg>
              <svg class="btnIcon checkGlyph" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
            </span>
            <span class="btnLabel">Copy</span>
          </button>
          <button class="closeBtn download" id="modalDownloadBtn" type="button">
            <span class="btnIconWrap">
              <svg class="btnIcon" viewBox="0 0 24 24">
                <path class="dlStem" d="M12 3v12"></path>
                <path class="dlHead" d="M8 11l4 4l4 -4"></path>
                <path class="dlBase" d="M4 21h16"></path>
              </svg>
            </span>
            <span class="btnLabel">Download</span>
          </button>
          <button class="closeBtn dismiss" id="modalCloseBtn" type="button">
            <span class="btnIconWrap">
              <svg class="btnIcon" viewBox="0 0 24 24"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
            </span>
            <span class="btnLabel">Close</span>
          </button>
        </div>
      </div>
      <div class="modalBody" id="modalBody">
        <div class="viewTabs" id="viewTabs">
          <button class="vtab active" data-view="pretty" type="button">Pretty</button>
          <button class="vtab" data-view="raw" type="button">Raw</button>
          <button class="vtab" data-view="tree" type="button">Tree</button>
          <span class="vtabSpacer"></span>
          <span class="vtabSearch">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.35-4.35"></path></svg>
            <input id="modalSearchInput" type="text" placeholder="Search..." />
          </span>
        </div>
        <div class="viewPanel active" id="vpPretty"></div>
        <div class="viewPanel" id="vpRaw"><div class="rawView" id="rawContent"></div></div>
        <div class="viewPanel" id="vpTree"><div class="treeView" id="treeContent"></div></div>
      </div>
    </div>
  </div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    function reportWebviewError(kind, err) {
      const payload = {
        kind: String(kind || 'error'),
        message: String((err && err.message) || err || 'unknown'),
        stack: String((err && err.stack) || '')
      };
      try { console.error('[FlowTestStatusPanel:webview]', payload); } catch {}
      try { vscodeApi.postMessage({ type: 'webviewError', payload }); } catch {}
    }
    window.addEventListener('error', (event) => reportWebviewError('window.error', event && (event.error || event.message)));
    window.addEventListener('unhandledrejection', (event) => reportWebviewError('window.unhandledrejection', event && event.reason));

    let readySent = false;
    function sendReadyOnce() {
      if (readySent) return;
      readySent = true;
      vscodeApi.postMessage({ type: 'ready' });
    }

    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function statusMeta(status) {
      const s = String(status || '').toLowerCase();
      if (s === 'running') return { cls: 'run', text: '● Running' };
      if (s === 'success') return { cls: 'ok', text: '✓ Completed' };
      if (s === 'warn') return { cls: 'warn', text: '⚠ Warn' };
      if (s === 'error') return { cls: 'err', text: '✕ Failed' };
      return { cls: '', text: 'ℹ Info' };
    }
    function controlForStage(stage) {
      const s = String(stage || '').toLowerCase().trim();
      if (s === 'api spec' || s === 'wiremock' || s === 'scenario dsl') return { cls: 'llm', text: 'LLM' };
      if (s === 'engine run') return { cls: 'java', text: 'Java' };
      return { cls: 'vscode', text: 'VS Code Copilot' };
    }
    function stageCls(stage) {
      return String(stage || '').toLowerCase().replace(/\s+/g, '-');
    }

    try {
      const timeline = document.getElementById('timeline');
      const summary = document.getElementById('summary');
      const runState = document.getElementById('runState');
      const runMeta = document.getElementById('runMeta');
      const successCount = document.getElementById('successCount');
      const failureCount = document.getElementById('failureCount');
      const intakeMode = document.getElementById('intakeMode');
      const runCenterSection = document.getElementById('runCenterSection');
      const timelineSection = document.getElementById('timelineSection');
      const runCenterCollapseBtn = document.getElementById('runCenterCollapseBtn');
      const timelineCollapseBtn = document.getElementById('timelineCollapseBtn');
      const sectionDivider = document.getElementById('sectionDivider');
      const followLogs = document.getElementById('followLogs');
      const runMetaDockWrap = document.getElementById('runMetaDockWrap');
      const runMetaDockGrid = document.getElementById('runMetaDockGrid');
      const runMetaDock = document.getElementById('runMetaDock');
      const runMetaDockClose = document.getElementById('runMetaDockClose');
      const runMetaDockLauncher = document.getElementById('runMetaDockLauncher');
      const detailModal = document.getElementById('detailModal');
      const modalTitle = document.getElementById('modalTitle');
      const modalBody = document.getElementById('modalBody');
      const modalCloseBtn = document.getElementById('modalCloseBtn');
      const modalCopyBtn = document.getElementById('modalCopyBtn');
      const modalDownloadBtn = document.getElementById('modalDownloadBtn');

      const detailStore = new Map();
      let detailId = 0;
      let modalName = 'detail';
      let modalText = '';
      let modalLang = 'text';

      /* --- Timer helpers --- */
      var aiTimers = new Map();
      function mmss(sec) { var m = Math.floor(sec / 60); var s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
      function stageKey(ev) { return (ev.stage || ''); }
      function startTimer(key, node) {
        if (aiTimers.has(key)) stopTimer(key);
        var start = Date.now();
        var pill = node;
        pill.classList.remove('hidden', 'done');
        var dot = pill.querySelector('.timerDot');
        var lbl = pill.querySelector('.timerLbl');
        function tick() { var sec = Math.round((Date.now() - start) / 1000); if (lbl) lbl.textContent = mmss(sec); }
        tick();
        var iv = setInterval(tick, 1000);
        aiTimers.set(key, { iv: iv, pill: pill, start: start });
      }
      function stopTimer(key) {
        var entry = aiTimers.get(key);
        if (!entry) return '';
        clearInterval(entry.iv);
        var elapsed = Math.round((Date.now() - entry.start) / 1000);
        var finalTime = mmss(elapsed);
        var lbl = entry.pill.querySelector('.timerLbl');
        if (lbl) lbl.textContent = finalTime;
        entry.pill.classList.add('done');
        aiTimers.delete(key);
        return finalTime;
      }
      var lastRowLabel = document.getElementById('lastRowLabel');
      const meta = { runName: '-', orchestrationId: '-', temporalLink: '-', outputPath: '-', wiremockBaseUrl: '-', allureResultsPath: '-', allureReportPath: '-' };

      function syncChevronState(btn, isCollapsed) {
        if (!btn) return;
        btn.classList.toggle('is-collapsed', Boolean(isCollapsed));
        btn.setAttribute('aria-expanded', String(!isCollapsed));
      }
      function updateLayout() {
        const rc = runCenterSection && runCenterSection.classList.contains('collapsed');
        const tl = timelineSection && timelineSection.classList.contains('collapsed');
        if (sectionDivider) sectionDivider.style.display = (!rc && !tl) ? 'block' : 'none';
        /* Reset inline styles from divider drag when collapsing/expanding */
        if (runCenterSection) {
          runCenterSection.style.flex = rc ? '0 0 auto' : '';
          runCenterSection.style.overflow = '';
          var rcBody = runCenterSection.querySelector('.sectionBody');
          if (rcBody) rcBody.style.maxHeight = '';
        }
        if (timelineSection) {
          timelineSection.style.flex = tl ? '0 0 auto' : '';
        }
        if (rc && !tl && timelineSection) timelineSection.style.flex = '1 1 auto';
      }

      /* --- Section Divider Drag --- */
      (function() {
        if (!sectionDivider || !runCenterSection || !timelineSection) return;
        var divDrag = null;
        var minTimeH = 120;
        sectionDivider.addEventListener('mousedown', function(e) {
          var panelStack = runCenterSection.parentElement;
          if (!panelStack) return;
          var stackH = panelStack.clientHeight - sectionDivider.offsetHeight;
          var rcH = runCenterSection.offsetHeight;
          /* Compute min = sectionHead height so header always visible */
          var rcHead = runCenterSection.querySelector('.sectionHead');
          var minRunH = rcHead ? rcHead.offsetHeight + 2 : 42;
          /* Compute max = natural content height (scrollHeight with maxHeight removed temporarily) */
          var rcBody = runCenterSection.querySelector('.sectionBody');
          var origMax = rcBody ? rcBody.style.maxHeight : '';
          var origFlex = runCenterSection.style.flex;
          if (rcBody) rcBody.style.maxHeight = 'none';
          runCenterSection.style.flex = '0 0 auto';
          var naturalRunH = runCenterSection.scrollHeight;
          runCenterSection.style.flex = origFlex || '';
          if (rcBody) rcBody.style.maxHeight = origMax || '';
          divDrag = { startY: e.clientY, startRunH: rcH, stackH: stackH, minRunH: minRunH, naturalRunH: naturalRunH };
          sectionDivider.classList.add('dragging');
          e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
          if (!divDrag) return;
          var delta = e.clientY - divDrag.startY;
          var newRunH = divDrag.startRunH + delta;
          var maxRunH = Math.min(divDrag.naturalRunH, divDrag.stackH - minTimeH);
          if (newRunH < divDrag.minRunH) newRunH = divDrag.minRunH;
          if (newRunH > maxRunH) newRunH = maxRunH;
          var newTimeH = divDrag.stackH - newRunH;
          runCenterSection.style.flex = '0 0 ' + newRunH + 'px';
          runCenterSection.style.overflow = 'hidden';
          var rcBody = runCenterSection.querySelector('.sectionBody');
          if (rcBody) rcBody.style.maxHeight = 'none';
          timelineSection.style.flex = '0 0 ' + newTimeH + 'px';
        });
        document.addEventListener('mouseup', function() {
          if (!divDrag) return;
          divDrag = null;
          sectionDivider.classList.remove('dragging');
        });
      })();
      function metaCopyButton(copyValue) {
        if (!copyValue || copyValue === '-') return '';
        return '<button class="metaCopyBtn" type="button" data-copy="' + esc(copyValue) + '" title="Copy">'
          + '<svg class="metaCopy" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1 -2 -2V4a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v1"></path></svg>'
          + '<svg class="metaCheck" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>'
          + '</button>';
      }
      function renderMeta() {
        if (runMeta) {
          runMeta.innerHTML =
            '<div class="metaChip"><span class="mk">Run</span><span class="mv"><span class="metaValueText">' + esc(meta.runName || '-') + '</span>' + metaCopyButton(meta.runName) + '</span></div>'
            + '<div class="metaChip"><span class="mk">Orchestration</span><span class="mv"><span class="metaValueText">' + esc(meta.orchestrationId || '-') + '</span>' + metaCopyButton(meta.orchestrationId) + '</span></div>';
        }
        if (runMetaDockGrid) {
          const temporal = String(meta.temporalLink || '-');
          const temporalView = temporal !== '-' ? '<a href="#" data-open-url="' + esc(temporal) + '">' + esc(temporal) + '</a>' : '<span class="runMetaDockValText">-</span>';
          runMetaDockGrid.innerHTML =
            '<div class="runMetaDockItem"><div class="runMetaDockKey">Temporal</div><div class="runMetaDockVal">' + temporalView + metaCopyButton(temporal) + '</div></div>'
            + '<div class="runMetaDockItem"><div class="runMetaDockKey">Output Path</div><div class="runMetaDockVal"><span class="runMetaDockValText">' + esc(meta.outputPath || '-') + '</span>' + metaCopyButton(meta.outputPath) + '</div></div>'
            + '<div class="runMetaDockItem"><div class="runMetaDockKey">WireMock Base URL</div><div class="runMetaDockVal"><span class="runMetaDockValText">' + esc(meta.wiremockBaseUrl || '-') + '</span>' + metaCopyButton(meta.wiremockBaseUrl) + '</div></div>'
            + '<div class="runMetaDockItem"><div class="runMetaDockKey">Allure Results</div><div class="runMetaDockVal"><span class="runMetaDockValText">' + esc(meta.allureResultsPath || '-') + '</span>' + metaCopyButton(meta.allureResultsPath) + '</div></div>'
            + '<div class="runMetaDockItem"><div class="runMetaDockKey">Allure Report</div><div class="runMetaDockVal"><span class="runMetaDockValText">' + esc(meta.allureReportPath || '-') + '</span>' + metaCopyButton(meta.allureReportPath) + '</div></div>';
        }
      }
      function setSummary(status, detail) {
        if (summary) {
          var sl = String(status || '').toLowerCase();
          var isDone = sl.includes('complete') || sl.includes('success');
          var isFail = sl.includes('fail') || sl.includes('error');
          var isThinking = !isDone && !isFail && sl !== '-' && sl !== 'cancelled';
          if (isThinking) {
            var progressText = detail ? String(detail) : String(status || 'Working...');
            if (!progressText.endsWith('...')) progressText += '...';
            summary.innerHTML = '<span class="summaryProgress">' + esc(progressText) + '</span>';
          } else if (isDone) {
            summary.innerHTML = '<span class="summaryStatus">' + esc(String(status || 'Completed')) + '</span>' + (detail ? ' <span class="summaryDetail"> — ' + esc(detail) + '</span>' : '');
          } else {
            summary.innerHTML = '<b>' + esc(String(status || '-')) + '</b>' + (detail ? ' <span class="summaryDetail"> — ' + esc(detail) + '</span>' : '');
          }
          summary.classList.remove('thinking', 'done');
          if (isThinking) summary.classList.add('thinking');
          if (isDone) summary.classList.add('done');
        }
        if (runState) runState.textContent = String(status || 'Running');
        const s = String(status || '').toLowerCase();
        if (runMetaDockWrap) {
          const done = s.includes('complete') || s.includes('success');
          runMetaDockWrap.classList.toggle('show', done);
          if (!done) runMetaDockWrap.classList.remove('collapsed');
          if (runMetaDockLauncher) runMetaDockLauncher.classList.toggle('show', done && runMetaDockWrap.classList.contains('collapsed'));
        }
        /* Stop all running timers on terminal status */
        if (s.includes('complete') || s.includes('success') || s.includes('fail') || s.includes('error')) {
          aiTimers.forEach(function(v, k) { clearInterval(v.iv); v.pill.classList.add('done'); });
          aiTimers.clear();
        }
      }
      function stripMarkdownFences(input) {
        var s = String(input || '');
        var t = s.trim();
        var BT = String.fromCharCode(96);
        var fence3 = BT + BT + BT;
        if (t.indexOf(fence3) !== 0) return s;
        var firstNL = t.indexOf(String.fromCharCode(10));
        if (firstNL === -1) return s;
        var body = t.substring(firstNL + 1);
        if (body.trimEnd().endsWith(fence3)) {
          body = body.trimEnd();
          body = body.substring(0, body.length - 3).trimEnd();
        }
        return body;
      }
      function detectLang(content, hint) {
        const h = String(hint || '').toLowerCase().trim();
        if (h === 'json' || h === 'xml' || h === 'text') return h;
        const t = String(content || '').trim();
        if (t.startsWith('{') || t.startsWith('[')) return 'json';
        if (t.startsWith('<')) return 'xml';
        return 'text';
      }
      function decodeEscapedJsonIfNeeded(input) {
        var raw = String(input || '');
        var t = raw.trim();
        if (!t) return raw;
        if ((t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') || (t.charAt(0) === '[' && t.charAt(t.length - 1) === ']')) return raw;
        try {
          if (t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') {
            var unwrapped = JSON.parse(t);
            if (typeof unwrapped === 'string') return unwrapped;
          }
        } catch (e) {}
        if (t.indexOf(String.fromCharCode(92)) !== -1 && t.indexOf(String.fromCharCode(10)) === -1) {
          try { return JSON.parse('"' + t + '"'); } catch (e) {}
        }
        return raw;
      }
      const vpPretty = document.getElementById('vpPretty');
      const vpRaw = document.getElementById('vpRaw');
      const vpTree = document.getElementById('vpTree');
      const rawContent = document.getElementById('rawContent');
      const treeContent = document.getElementById('treeContent');
      const viewTabs = document.getElementById('viewTabs');
      const modalSearchInput = document.getElementById('modalSearchInput');

      let parsedJson = null;
      let activeView = 'pretty';

      /* --- Tab switching --- */
      if (viewTabs) viewTabs.addEventListener('click', (e) => {
        const tab = e.target && e.target.closest ? e.target.closest('.vtab') : null;
        if (!tab) return;
        const view = tab.getAttribute('data-view');
        if (!view || view === activeView) return;
        activeView = view;
        viewTabs.querySelectorAll('.vtab').forEach(function(t) { t.classList.toggle('active', t === tab); });
        [vpPretty, vpRaw, vpTree].forEach(function(p) { if (p) p.classList.remove('active'); });
        if (view === 'pretty' && vpPretty) vpPretty.classList.add('active');
        if (view === 'raw' && vpRaw) vpRaw.classList.add('active');
        if (view === 'tree' && vpTree) vpTree.classList.add('active');
      });

      /* --- Search --- */
      if (modalSearchInput) modalSearchInput.addEventListener('input', function() {
        const q = modalSearchInput.value.trim();
        highlightSearch(q);
      });

      function highlightInContainer(container, query) {
        if (!container) return 0;
        // Remove old highlights
        container.querySelectorAll('mark.searchHit').forEach(function(m) {
          var parent = m.parentNode;
          if (parent) { parent.replaceChild(document.createTextNode(m.textContent || ''), m); parent.normalize(); }
        });
        if (!query) return 0;
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        var hits = [];
        var node;
        while ((node = walker.nextNode())) {
          var text = node.textContent || '';
          var lower = text.toLowerCase();
          var qLower = query.toLowerCase();
          var startIdx = 0;
          var idx;
          while ((idx = lower.indexOf(qLower, startIdx)) !== -1) {
            hits.push({ node: node, idx: idx, len: query.length });
            startIdx = idx + qLower.length;
          }
        }
        for (var i = hits.length - 1; i >= 0; i--) {
          var h = hits[i];
          try {
            var range = document.createRange();
            range.setStart(h.node, h.idx);
            range.setEnd(h.node, h.idx + h.len);
            var mark = document.createElement('mark');
            mark.className = 'searchHit';
            range.surroundContents(mark);
          } catch(e) {}
        }
        return hits.length;
      }

      function highlightSearch(query) {
        // Pretty tab
        var code = vpPretty ? vpPretty.querySelector('code') : null;
        highlightInContainer(code, query);
        if (code) {
          var first = code.querySelector('mark.searchHit');
          if (first && activeView === 'pretty') first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        // Raw tab
        if (rawContent) {
          highlightInContainer(rawContent, query);
          var firstRaw = rawContent.querySelector('mark.searchHit');
          if (firstRaw && activeView === 'raw') firstRaw.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        // Tree tab
        if (treeContent) {
          // Clear old row highlights
          treeContent.querySelectorAll('.treeRow.searchMatch').forEach(function(r) { r.classList.remove('searchMatch'); });
          highlightInContainer(treeContent, query);
          // Highlight matching rows and expand parents
          if (query) {
            treeContent.querySelectorAll('mark.searchHit').forEach(function(m) {
              var row = m.closest('.treeRow');
              if (row) row.classList.add('searchMatch');
              // Expand collapsed parent nodes
              var parent = m.closest('.treeChildren.hidden');
              while (parent) {
                parent.classList.remove('hidden');
                var prevToggle = parent.previousElementSibling ? parent.previousElementSibling.querySelector('.treeToggle') : null;
                if (prevToggle) prevToggle.classList.remove('collapsed');
                parent = parent.parentElement ? parent.parentElement.closest('.treeChildren.hidden') : null;
              }
            });
            var firstTree = treeContent.querySelector('mark.searchHit');
            if (firstTree && activeView === 'tree') firstTree.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }
      }

      /* --- Tree builder (Postman style) --- */
      function buildTreeNode(key, value, depth) {
        var wrap = document.createElement('div');
        wrap.className = 'treeNode';
        var row = document.createElement('div');
        row.className = 'treeRow';
        row.style.paddingLeft = (depth * 18 + 8) + 'px';

        var isObj = value !== null && typeof value === 'object';
        var isArr = Array.isArray(value);
        var hasKids = isObj && (isArr ? value.length > 0 : Object.keys(value).length > 0);

        // Toggle arrow
        var toggle = document.createElement('span');
        toggle.className = 'treeToggle' + (hasKids ? '' : ' leaf');
        toggle.textContent = hasKids ? '▼' : '';

        // Key
        var keyEl = null;
        if (key !== null) {
          keyEl = document.createElement('span');
          keyEl.className = 'treeKey';
          keyEl.textContent = JSON.stringify(key);
          var colon = document.createElement('span');
          colon.className = 'treeColon';
          colon.textContent = ':';
        }

        // Value or brace
        var valEl = document.createElement('span');
        valEl.className = 'treeVal';
        if (isArr) {
          valEl.innerHTML = '<span class="treeBrace">[</span>';
          if (!hasKids) valEl.innerHTML = '<span class="treeBrace">[]</span>';
          var typeHint = document.createElement('span');
          typeHint.className = 'treeType';
          typeHint.textContent = value.length + ' item' + (value.length !== 1 ? 's' : '');
          valEl.appendChild(typeHint);
        } else if (isObj) {
          var count = Object.keys(value).length;
          valEl.innerHTML = '<span class="treeBrace">{</span>';
          if (!hasKids) valEl.innerHTML = '<span class="treeBrace">{}</span>';
          var typeHint2 = document.createElement('span');
          typeHint2.className = 'treeType';
          typeHint2.textContent = count + ' key' + (count !== 1 ? 's' : '');
          valEl.appendChild(typeHint2);
        } else if (value === null) {
          valEl.className = 'treeVal null';
          valEl.textContent = 'null';
        } else if (typeof value === 'string') {
          valEl.className = 'treeVal str';
          valEl.textContent = JSON.stringify(value);
        } else if (typeof value === 'number') {
          valEl.className = 'treeVal num';
          valEl.textContent = String(value);
        } else if (typeof value === 'boolean') {
          valEl.className = 'treeVal bool';
          valEl.textContent = String(value);
        } else {
          valEl.textContent = String(value);
        }

        // Copy button for leaf values
        var copyBtn = document.createElement('button');
        copyBtn.className = 'treeCopyBtn';
        copyBtn.textContent = '📋';
        copyBtn.title = 'Copy value';
        copyBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var copyVal = (isObj) ? JSON.stringify(value, null, 2) : String(value);
          navigator.clipboard.writeText(copyVal).catch(function() {});
          copyBtn.textContent = '✓';
          setTimeout(function() { copyBtn.textContent = '📋'; }, 800);
        });

        row.appendChild(toggle);
        if (keyEl) { row.appendChild(keyEl); row.appendChild(colon); }
        row.appendChild(valEl);
        row.appendChild(copyBtn);
        wrap.appendChild(row);

        if (hasKids) {
          var children = document.createElement('div');
          children.className = 'treeChildren';
          if (isArr) {
            for (var i = 0; i < value.length; i++) {
              children.appendChild(buildTreeNode(String(i), value[i], depth + 1));
            }
            // closing bracket
            var closingArr = document.createElement('div');
            closingArr.className = 'treeRow';
            closingArr.style.paddingLeft = (depth * 18 + 8 + 16) + 'px';
            closingArr.innerHTML = '<span class="treeBrace">]</span>';
            children.appendChild(closingArr);
          } else {
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
              children.appendChild(buildTreeNode(keys[j], value[keys[j]], depth + 1));
            }
            var closingObj = document.createElement('div');
            closingObj.className = 'treeRow';
            closingObj.style.paddingLeft = (depth * 18 + 8 + 16) + 'px';
            closingObj.innerHTML = '<span class="treeBrace">}</span>';
            children.appendChild(closingObj);
          }
          wrap.appendChild(children);

          // Toggle collapse
          toggle.addEventListener('click', function(ev) {
            ev.stopPropagation();
            var isHidden = children.classList.contains('hidden');
            children.classList.toggle('hidden');
            toggle.classList.toggle('collapsed', !isHidden);
            // Show inline summary when collapsed
            if (!isHidden) {
              var closing = isArr ? ']' : '}';
              valEl.querySelector('.treeType').textContent = (isArr ? value.length + ' item' + (value.length !== 1 ? 's' : '') : Object.keys(value).length + ' key' + (Object.keys(value).length !== 1 ? 's' : ''))
                + ' … ' + closing;
            } else {
              valEl.querySelector('.treeType').textContent = isArr
                ? value.length + ' item' + (value.length !== 1 ? 's' : '')
                : Object.keys(value).length + ' key' + (Object.keys(value).length !== 1 ? 's' : '');
            }
          });

          // Row click also toggles
          row.addEventListener('click', function(e) {
            if (e.target === copyBtn || e.target.closest('.treeCopyBtn')) return;
            var wasHidden = children.classList.contains('hidden');
            children.classList.toggle('hidden');
            toggle.classList.toggle('collapsed', wasHidden === false);
            var typeEl = valEl.querySelector('.treeType');
            if (typeEl) {
              if (!wasHidden) {
                var closing = isArr ? ']' : '}';
                typeEl.textContent = (isArr ? value.length + ' item' + (value.length !== 1 ? 's' : '') : Object.keys(value).length + ' key' + (Object.keys(value).length !== 1 ? 's' : '')) + ' \u2026 ' + closing;
              } else {
                typeEl.textContent = isArr ? value.length + ' item' + (value.length !== 1 ? 's' : '') : Object.keys(value).length + ' key' + (Object.keys(value).length !== 1 ? 's' : '');
              }
            }
          });
          row.style.cursor = 'pointer';
        }

        return wrap;
      }

      function renderTree(parsed) {
        if (!treeContent) return;
        treeContent.innerHTML = '';
        if (parsed === null || typeof parsed !== 'object') {
          treeContent.innerHTML = '<div style="padding:12px;color:var(--muted);">Not a JSON object/array</div>';
          return;
        }
        treeContent.appendChild(buildTreeNode(null, parsed, 0));
      }
      var NL = String.fromCharCode(10);
      function jsonIndent(level) { return '  '.repeat(Math.max(0, level)); }
      function jsonToHtml(value, level) {
        if (value === null) return '<span class="tok-null">null</span>';
        if (typeof value === 'string') return '<span class="tok-str">' + esc(JSON.stringify(value)) + '</span>';
        if (typeof value === 'number') return '<span class="tok-num">' + esc(String(value)) + '</span>';
        if (typeof value === 'boolean') return '<span class="tok-bool">' + esc(String(value)) + '</span>';
        if (Array.isArray(value)) {
          if (value.length === 0) return '<span class="tok-punc">[]</span>';
          var out = '<span class="tok-punc">[</span>' + NL;
          for (var i = 0; i < value.length; i++) {
            out += jsonIndent(level + 1) + jsonToHtml(value[i], level + 1);
            if (i < value.length - 1) out += '<span class="tok-punc">,</span>';
            out += NL;
          }
          return out + jsonIndent(level) + '<span class="tok-punc">]</span>';
        }
        if (typeof value === 'object') {
          var entries = Object.entries(value);
          if (entries.length === 0) return '<span class="tok-punc">{}</span>';
          var out2 = '<span class="tok-punc">{</span>' + NL;
          for (var j = 0; j < entries.length; j++) {
            var pair = entries[j];
            out2 += jsonIndent(level + 1)
              + '<span class="tok-key">' + esc(JSON.stringify(pair[0])) + '</span>'
              + '<span class="tok-punc">:</span> '
              + jsonToHtml(pair[1], level + 1);
            if (j < entries.length - 1) out2 += '<span class="tok-punc">,</span>';
            out2 += NL;
          }
          return out2 + jsonIndent(level) + '<span class="tok-punc">}</span>';
        }
        return esc(String(value));
      }

      function countLines(text) {
        if (!text) return 0;
        var n = 1;
        for (var i = 0; i < text.length; i++) { if (text.charAt(i) === String.fromCharCode(10)) n++; }
        return n;
      }

      function buildLineNums(count) {
        var parts = [];
        for (var i = 1; i <= count; i++) parts.push('<span>' + i + '</span>');
        return parts.join('');
      }

      function renderModalContent(content, title) {
        const source = decodeEscapedJsonIfNeeded(content);
        const text = stripMarkdownFences(String(source || ''));
        modalLang = detectLang(text, title);
        parsedJson = null;

        // Reset tabs to Pretty
        activeView = 'pretty';
        if (viewTabs) {
          viewTabs.querySelectorAll('.vtab').forEach(function(t) {
            t.classList.toggle('active', t.getAttribute('data-view') === 'pretty');
          });
        }
        [vpPretty, vpRaw, vpTree].forEach(function(p) { if (p) p.classList.remove('active'); });
        if (vpPretty) vpPretty.classList.add('active');
        if (modalSearchInput) modalSearchInput.value = '';

        if (modalLang === 'json') {
          try {
            parsedJson = JSON.parse(text);
            modalText = JSON.stringify(parsedJson, null, 2);

            // Pretty view with line numbers + syntax highlighting
            var lineCount = countLines(modalText);
            if (vpPretty) {
              vpPretty.innerHTML =
                '<div class="prettyWrap">'
                + '<div class="lineNums">' + buildLineNums(lineCount) + '</div>'
                + '<pre class="codeFrame"><code>' + jsonToHtml(parsedJson, 0) + '</code></pre>'
                + '</div>';
            }

            // Raw view
            if (rawContent) rawContent.textContent = text;

            // Tree view
            renderTree(parsedJson);

            // Show tree tab
            if (viewTabs) {
              var treeTab = viewTabs.querySelector('[data-view="tree"]');
              if (treeTab) treeTab.style.display = '';
            }
            return;
          } catch (e) {
            modalText = text;
          }
        } else {
          modalText = text;
        }
        // Non-JSON or parse failed
        var label = modalLang.toUpperCase();
        var lc = countLines(modalText);
        if (vpPretty) {
          vpPretty.innerHTML =
            '<div class="codeLang">' + esc(label) + '</div>'
            + '<div class="prettyWrap">'
            + '<div class="lineNums">' + buildLineNums(lc) + '</div>'
            + '<pre class="codeFrame"><code>' + esc(modalText) + '</code></pre>'
            + '</div>';
        }
        if (rawContent) rawContent.textContent = modalText;
        // Hide tree tab for non-JSON
        if (viewTabs) {
          var treeTab2 = viewTabs.querySelector('[data-view="tree"]');
          if (treeTab2) treeTab2.style.display = 'none';
        }
        if (treeContent) treeContent.innerHTML = '';
      }
      function addEvent(ev) {
        if (!timeline) return;
        const sm = statusMeta(ev.status);
        const cm = controlForStage(ev.stage);
        const sc = stageCls(ev.stage);
        const row = document.createElement('div');
        row.className = 'event compact';
        let actionsHtml = '';
        if (Array.isArray(ev.actions) && ev.actions.length > 0) {
          const arr = [];
          for (let i = 0; i < ev.actions.length; i++) {
            const a = ev.actions[i];
            const id = 'd_' + (++detailId);
            detailStore.set(id, { title: a.title || a.label || 'Details', content: a.content || '' });
            arr.push('<button class="actionBtn" data-id="' + id + '" type="button">' + esc(a.label || 'View') + '</button>');
          }
          actionsHtml = '<div class="actions">' + arr.join('') + '</div>';
        }
        let metaHtml = '';
        if (ev.meta && typeof ev.meta === 'object') {
          var metaKeys = Object.keys(ev.meta);
          if (metaKeys.length > 0) {
            var metaRows = [];
            for (var mi = 0; mi < metaKeys.length; mi++) {
              var mk = metaKeys[mi];
              var mv = ev.meta[mk];
              metaRows.push('<tr><td class="metaKey">' + esc(String(mk)) + '</td><td class="metaVal">' + esc(String(mv != null ? mv : '')) + '</td></tr>');
            }
            metaHtml = '<table class="metaTable"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>' + metaRows.join('') + '</tbody></table>';
          }
        }
        var hasBody = !!(ev.detail || metaHtml || actionsHtml);
        var expandBtnHtml = hasBody ? '<button class="expandBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button>' : '';
        row.innerHTML =
          '<span class="dot"></span><div>'
          + '<div class="rowTop"><span class="time">' + esc(ev.time || '') + '</span>'
          + '<span class="stageTag ' + sc + '">' + esc(ev.stage || '') + '</span>'
          + '<span class="statusPill ' + sm.cls + '">' + sm.text + '</span>'
          + '<span class="controlChip ' + cm.cls + '">' + cm.text + '</span>'
          + '<span class="timerPill hidden" id="tp_' + detailId + '"><span class="timerDot"></span><span class="timerLbl">00:00</span></span>'
          + '<span class="titleWrap"><span class="title">' + esc(ev.title || '') + '</span>'
          + expandBtnHtml + '</span></div>'
          + (hasBody ? '<div class="eventBody">' + (ev.detail ? '<div class="detail">' + esc(ev.detail) + '</div>' : '') + metaHtml + actionsHtml + '</div>' : '') + '</div>';
        timeline.appendChild(row);
        /* Timer logic — only for LLM dispatched→received and Java started→completed */
        var tKey = stageKey(ev);
        var tPill = row.querySelector('.timerPill');
        var evTitle = String(ev.title || '').toLowerCase();
        var st = String(ev.status || '').toLowerCase();
        var isLlmStart = cm.cls === 'llm' && (evTitle.includes('dispatch') || evTitle.includes('request'));
        var isJavaStart = cm.cls === 'java' && (st === 'in_progress' || st === 'running' || evTitle.includes('start') || evTitle.includes('executing'));
        var isTimerStart = isLlmStart || isJavaStart;
        if (isTimerStart && (st === 'in_progress' || st === 'running')) {
          if (tPill) startTimer(tKey, tPill);
        } else if (cm.cls === 'llm' || cm.cls === 'java') {
          var finalTime = stopTimer(tKey);
          if (tPill && (st === 'completed' || st === 'success' || st === 'done')) {
            tPill.classList.remove('hidden');
            tPill.classList.add('done');
            if (finalTime) { var tLbl = tPill.querySelector('.timerLbl'); if (tLbl) tLbl.textContent = finalTime; }
          }
        }
        /* Update lastRowLabel */
        if (lastRowLabel) { lastRowLabel.textContent = ev.title || ev.stage || ''; }
        if (followLogs && followLogs.checked) timeline.scrollTop = timeline.scrollHeight;
      }

      /* ---------- Inline fake run for testing ---------- */
      (function() {
        var fakeBtn = document.getElementById('fakeRunBtn');
        if (!fakeBtn) return;
        fakeBtn.addEventListener('click', function() {
          fakeBtn.disabled = true;
          fakeBtn.textContent = 'Running...';
          runFakeTimeline().then(function() {
            fakeBtn.disabled = false;
            fakeBtn.textContent = 'Fake';
          });
        });
      })();
      function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
      async function runFakeTimeline() {
        /* Clear timeline */
        if (timeline) timeline.innerHTML = '';
        aiTimers.forEach(function(v, k) { clearInterval(v.iv); });
        aiTimers.clear();
        if (summary) { summary.innerHTML = '<b>Status:</b> Running...'; summary.classList.add('thinking'); }

        /* Large JSON fixture */
        var bigSpec = {
          openapi: '3.0.3',
          info: { title: 'FlowTest Generated Service', version: '2.1.0', description: 'Auto-generated OpenAPI spec for the FlowTest Fake Regression Suite covering eligibility, disconnect, reconnect and transfer flows.', contact: { name: 'FlowTest Platform', email: 'flowtest@example.com' }, license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' } },
          servers: [{ url: 'http://localhost:8080', description: 'WireMock local' }, { url: 'https://api.staging.example.com', description: 'Staging' }],
          tags: [{ name: 'eligibility', description: 'Eligibility checking endpoints' }, { name: 'disconnect', description: 'Service disconnect flow' }, { name: 'reconnect', description: 'Service reconnect flow' }, { name: 'transfer', description: 'Service transfer flow' }, { name: 'health', description: 'Health and readiness probes' }],
          paths: {
            '/v1/eligibility/check': { post: { tags: ['eligibility'], summary: 'Check customer eligibility', operationId: 'checkEligibility', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerId', 'serviceType', 'requestType'], properties: { customerId: { type: 'string', description: 'Unique customer identifier', example: 'CUST-100234' }, serviceType: { type: 'string', enum: ['ELECTRICITY', 'GAS', 'WATER', 'TELECOM'], description: 'Type of utility service' }, requestType: { type: 'string', enum: ['DISCONNECT', 'RECONNECT', 'TRANSFER'], description: 'Type of service request' }, customerName: { type: 'string', description: 'Legal name of the customer' }, customerClassification: { type: 'string', enum: ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL'] }, effectiveDate: { type: 'string', format: 'date', description: 'Requested effective date' }, metadata: { type: 'object', properties: { source: { type: 'string' }, correlationId: { type: 'string', format: 'uuid' }, priority: { type: 'integer', minimum: 1, maximum: 5 } } } } } } } }, responses: { '200': { description: 'Eligibility result', content: { 'application/json': { schema: { type: 'object', properties: { eligible: { type: 'boolean' }, reason: { type: 'string' }, restrictions: { type: 'array', items: { type: 'string' } }, estimatedCompletionDays: { type: 'integer' } } } } } }, '400': { description: 'Invalid request' }, '404': { description: 'Customer not found' }, '503': { description: 'Dependency timeout' } } } },
            '/v1/disconnect': { post: { tags: ['disconnect'], summary: 'Initiate service disconnect', operationId: 'initiateDisconnect', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerId', 'serviceType', 'reason'], properties: { customerId: { type: 'string' }, serviceType: { type: 'string' }, reason: { type: 'string', enum: ['CUSTOMER_REQUEST', 'NON_PAYMENT', 'SAFETY', 'REGULATORY'] }, scheduledDate: { type: 'string', format: 'date-time' }, notifyCustomer: { type: 'boolean', default: true }, notes: { type: 'string', maxLength: 500 } } } } } }, responses: { '200': { description: 'Disconnect initiated', content: { 'application/json': { schema: { type: 'object', properties: { orderId: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['PENDING', 'SCHEDULED', 'IN_PROGRESS'] }, estimatedCompletion: { type: 'string', format: 'date-time' } } } } } }, '409': { description: 'Active pending order exists' } } } },
            '/v1/reconnect': { post: { tags: ['reconnect'], summary: 'Initiate service reconnect', operationId: 'initiateReconnect', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerId', 'serviceType'], properties: { customerId: { type: 'string' }, serviceType: { type: 'string' }, paymentConfirmation: { type: 'string' }, expedited: { type: 'boolean', default: false } } } } } }, responses: { '200': { description: 'Reconnect initiated' }, '402': { description: 'Outstanding balance' } } } },
            '/v1/transfer': { post: { tags: ['transfer'], summary: 'Transfer service to new address', operationId: 'transferService', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerId', 'serviceType', 'newAddress'], properties: { customerId: { type: 'string' }, serviceType: { type: 'string' }, newAddress: { type: 'object', required: ['street', 'city', 'state', 'zip'], properties: { street: { type: 'string' }, unit: { type: 'string' }, city: { type: 'string' }, state: { type: 'string', minLength: 2, maxLength: 2 }, zip: { type: 'string', pattern: '^[0-9]{5}$' } } }, transferDate: { type: 'string', format: 'date' } } } } } }, responses: { '200': { description: 'Transfer initiated' }, '400': { description: 'Address validation failed' } } } },
            '/health': { get: { tags: ['health'], summary: 'Health check', operationId: 'healthCheck', responses: { '200': { description: 'Healthy', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, uptime: { type: 'number' }, dependencies: { type: 'object' } } } } } } } } }
          },
          components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
          security: [{ bearerAuth: [] }]
        };
        var bigSpecStr = JSON.stringify(bigSpec);

        /* Events with in_progress -> success pairs and delays totaling ~10s */
        var events = [
          { delay: 300, ev: { time: '10:00:01', stage: 'UI', status: 'success', title: 'Status Panel Initialized', detail: 'Fake run bootstrapped.', meta: { editor: 'VS Code', extension: 'flowtest-copilot', version: '0.0.1' } } },
          { delay: 400, ev: { time: '10:00:02', stage: 'Intake', status: 'success', title: 'Documents Received', detail: '5 documents captured.', meta: { docs: 5, mode: 'multi_upload', format: 'json' } } },
          { delay: 500, ev: { time: '10:00:03', stage: 'API Spec', status: 'in_progress', title: 'AI Request Dispatched', detail: 'task=GENERATE_API_SPEC', meta: { task: 'GENERATE_API_SPEC', provider: 'copilot', model: 'gpt-4o' } } },
          { delay: 3000, ev: { time: '10:00:06', stage: 'API Spec', status: 'success', title: 'AI Response Received', detail: bigSpecStr.length + ' chars', meta: { task: 'GENERATE_API_SPEC', provider: 'copilot', model: 'gpt-4o', response_chars: bigSpecStr.length, duration_ms: 3100 }, actions: [{ label: 'AI Response', title: 'API Spec - Generated', content: bigSpecStr }] } },
          { delay: 500, ev: { time: '10:00:07', stage: 'WireMock', status: 'in_progress', title: 'Generating Mocks', detail: 'Building WireMock stubs...', meta: { endpoint: '/v1/eligibility/check', method: 'POST' } } },
          { delay: 2000, ev: { time: '10:00:09', stage: 'WireMock', status: 'success', title: 'Mocks Completed', detail: '4 mappings generated.', meta: { mappings: 4, base_url: 'http://localhost:8080', duration_ms: 1980 }, actions: [{ label: 'Mocks', title: 'WireMock Mappings', content: JSON.stringify([{request:{method:'POST',url:'/v1/eligibility/check'},response:{status:200,body:'{eligible:true}'}},{request:{method:'POST',url:'/v1/disconnect'},response:{status:200}},{request:{method:'POST',url:'/v1/reconnect'},response:{status:200}},{request:{method:'POST',url:'/v1/transfer'},response:{status:200}}], null, 2) }] } },
          { delay: 400, ev: { time: '10:00:10', stage: 'Scenario DSL', status: 'in_progress', title: 'Generating Scenario', detail: 'task=GENERATE_SCENARIO_DSL', meta: { task: 'GENERATE_SCENARIO_DSL', provider: 'copilot', model: 'gpt-4o' } } },
          { delay: 1800, ev: { time: '10:00:12', stage: 'Scenario DSL', status: 'success', title: 'Scenario Generated', detail: '7 steps validated.', meta: { steps: 7, tags: 'ui,api,db,async,vision', duration_ms: 1750 } } },
          { delay: 300, ev: { time: '10:00:13', stage: 'Engine Run', status: 'in_progress', title: 'Executing Test', detail: 'HTTP POST /engine/run', meta: { endpoint: 'http://localhost:9090/engine/run', method: 'POST' } } },
          { delay: 1500, ev: { time: '10:00:14', stage: 'Engine Run', status: 'success', title: 'Execution Completed', detail: 'HTTP 200 — 12 passed, 0 failed', meta: { status: 200, duration_ms: 1480, assertions_passed: 12, assertions_failed: 0 } } },
          { delay: 500, ev: { time: '10:00:15', stage: 'Artifacts', status: 'success', title: 'Persisted', detail: '/workspace/.flowtest-runs/fake', meta: { output_path: '/workspace/.flowtest-runs/fake', files: 4 } } }
        ];

        setSummary('API Spec generating...', 'Fake regression sequence');

        for (var i = 0; i < events.length; i++) {
          await sleep(events[i].delay);
          var e = events[i].ev;
          addEvent(e);
          /* Update summary text per stage */
          if (e.status === 'in_progress' || e.status === 'running') {
            setSummary(e.title + '...', e.stage);
          }
        }
        setSummary('Completed', 'Fake regression sequence finished');
      }

      if (timeline) timeline.addEventListener('click', (event) => {
        const expandBtn = event.target && event.target.closest ? event.target.closest('.expandBtn') : null;
        if (expandBtn) {
          const row = expandBtn.closest('.event');
          if (row) row.classList.toggle('compact');
          return;
        }
        const actionBtn = event.target && event.target.closest ? event.target.closest('.actionBtn') : null;
        if (actionBtn) {
          const payload = detailStore.get(actionBtn.getAttribute('data-id'));
          if (!payload) return;
          modalName = payload.title || 'detail';
          if (modalTitle) modalTitle.textContent = modalName;
          renderModalContent(payload.content || '', payload.title || '');
          if (detailModal) detailModal.classList.add('open');
        }
      });
      if (runCenterCollapseBtn) runCenterCollapseBtn.addEventListener('click', () => {
        if (runCenterSection) runCenterSection.classList.toggle('collapsed');
        syncChevronState(runCenterCollapseBtn, runCenterSection && runCenterSection.classList.contains('collapsed'));
        updateLayout();
      });
      if (timelineCollapseBtn) timelineCollapseBtn.addEventListener('click', () => {
        if (timelineSection) timelineSection.classList.toggle('collapsed');
        syncChevronState(timelineCollapseBtn, timelineSection && timelineSection.classList.contains('collapsed'));
        updateLayout();
      });
      if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => { if (detailModal) { detailModal.classList.remove('open'); var mc = detailModal.querySelector('.modalCard'); if (mc) { mc.style.left = '50%'; mc.style.top = '50%'; mc.style.transform = 'translate(-50%, -50%)'; } } });
      /* Modal drag */
      (function() {
        var modalHead = detailModal ? detailModal.querySelector('.modalHead') : null;
        var modalCard = detailModal ? detailModal.querySelector('.modalCard') : null;
        if (!modalHead || !modalCard) return;
        var drag = null;
        modalHead.addEventListener('mousedown', function(e) {
          if (e.target && e.target.closest && e.target.closest('button')) return;
          var rect = modalCard.getBoundingClientRect();
          drag = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };
          modalCard.style.transform = 'none';
          modalCard.style.left = rect.left + 'px';
          modalCard.style.top = rect.top + 'px';
          e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
          if (!drag) return;
          var newLeft = drag.origLeft + (e.clientX - drag.startX);
          var newTop = drag.origTop + (e.clientY - drag.startY);
          modalCard.style.left = newLeft + 'px';
          modalCard.style.top = newTop + 'px';
        });
        document.addEventListener('mouseup', function() {
          drag = null;
        });
      })();
      if (modalCopyBtn) modalCopyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(modalText || ''); } catch {} });
      if (modalDownloadBtn) modalDownloadBtn.addEventListener('click', () => {
        const ext = modalLang === 'json' ? 'json' : (modalLang === 'xml' ? 'xml' : 'txt');
        const mime = modalLang === 'json' ? 'application/json;charset=utf-8' : (modalLang === 'xml' ? 'application/xml;charset=utf-8' : 'text/plain;charset=utf-8');
        const blob = new Blob([modalText || ''], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = String(modalName || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.' + ext;
        a.click();
        URL.revokeObjectURL(url);
      });
      if (runMeta) runMeta.addEventListener('click', async (event) => {
        const copyBtn = event.target && event.target.closest ? event.target.closest('.metaCopyBtn') : null;
        if (copyBtn) { try { await navigator.clipboard.writeText(copyBtn.getAttribute('data-copy') || ''); } catch {} }
      });
      if (runMetaDock) runMetaDock.addEventListener('click', async (event) => {
        const copyBtn = event.target && event.target.closest ? event.target.closest('.metaCopyBtn') : null;
        if (copyBtn) { try { await navigator.clipboard.writeText(copyBtn.getAttribute('data-copy') || ''); } catch {} return; }
        const link = event.target && event.target.closest ? event.target.closest('[data-open-url]') : null;
        if (link) { event.preventDefault(); vscodeApi.postMessage({ type: 'openExternal', url: link.getAttribute('data-open-url') || '' }); }
      });
      if (runMetaDockClose) runMetaDockClose.addEventListener('click', () => {
        if (runMetaDockWrap) runMetaDockWrap.classList.add('collapsed');
        if (runMetaDockLauncher) runMetaDockLauncher.classList.add('show');
      });
      /* Execution Result dock drag */
      (function() {
        var dockHead = runMetaDock ? runMetaDock.querySelector('.runMetaDockHead') : null;
        if (!dockHead || !runMetaDockWrap) return;
        var dockDrag = null;
        var dockOffsetX = 0;
        var dockOffsetY = 0;
        dockHead.addEventListener('mousedown', function(e) {
          if (e.target && e.target.closest && e.target.closest('button')) return;
          dockDrag = { startX: e.clientX, startY: e.clientY, baseX: dockOffsetX, baseY: dockOffsetY };
          runMetaDockWrap.classList.add('dragging');
          e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
          if (!dockDrag) return;
          var nextX = dockDrag.baseX + (e.clientX - dockDrag.startX);
          var nextY = dockDrag.baseY + (e.clientY - dockDrag.startY);
          var maxX = window.innerWidth / 2 - 40;
          var maxY = window.innerHeight - 80;
          var clampX = Math.max(-maxX, Math.min(maxX, nextX));
          var clampY = Math.max(-maxY, Math.min(40, nextY));
          dockOffsetX = clampX;
          dockOffsetY = clampY;
          runMetaDockWrap.style.transform = 'translate(' + dockOffsetX + 'px, ' + dockOffsetY + 'px)';
        });
        document.addEventListener('mouseup', function() {
          if (!dockDrag) return;
          dockDrag = null;
          runMetaDockWrap.classList.remove('dragging');
        });
      })();
      if (runMetaDockLauncher) runMetaDockLauncher.addEventListener('click', () => {
        if (runMetaDockWrap) {
          runMetaDockWrap.classList.remove('collapsed');
          runMetaDockWrap.classList.add('show');
        }
        runMetaDockLauncher.classList.remove('show');
      });

      window.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'init') {
          const p = msg.payload || {};
          meta.runName = p.runName || '-';
          meta.orchestrationId = p.orchestrationId || '-';
          meta.temporalLink = p.temporalLink || '-';
          meta.outputPath = p.outputPath || 'pending (.flowtest-runs)';
          meta.wiremockBaseUrl = p.wiremockBaseUrl || 'pending (engine will publish base URL)';
          meta.allureResultsPath = '-';
          meta.allureReportPath = '-';
          renderMeta();
          if (successCount) successCount.textContent = String(p.successCount ?? 0);
          if (failureCount) failureCount.textContent = String(p.failureCount ?? 0);
          if (intakeMode) intakeMode.textContent = String(p.intakeMode || '-');
          /* Hide Fake button during real runs */
          var fb = document.getElementById('fakeRunBtn');
          if (fb) fb.style.display = 'none';
          if (lastRowLabel) lastRowLabel.textContent = '';
        } else if (msg.type === 'temporal') {
          const p = msg.payload || {};
          if (p.temporalLink) { meta.temporalLink = p.temporalLink; renderMeta(); }
        } else if (msg.type === 'meta') {
          const p = msg.payload || {};
          if (p.outputPath) meta.outputPath = p.outputPath;
          if (p.wiremockBaseUrl) meta.wiremockBaseUrl = p.wiremockBaseUrl;
          if (p.allureResultsPath) meta.allureResultsPath = p.allureResultsPath;
          if (p.allureReportPath) meta.allureReportPath = p.allureReportPath;
          renderMeta();
        } else if (msg.type === 'event') {
          addEvent(msg.payload || {});
        } else if (msg.type === 'summary') {
          const p = msg.payload || {};
          setSummary(p.status || '-', p.detail);
        }
      });

      renderMeta();
      syncChevronState(runCenterCollapseBtn, runCenterSection && runCenterSection.classList.contains('collapsed'));
      syncChevronState(timelineCollapseBtn, timelineSection && timelineSection.classList.contains('collapsed'));
      updateLayout();
      addEvent({ time: new Date().toLocaleTimeString([], { hour12: false }), stage: 'UI', status: 'info', title: 'Webview Ready', detail: 'Timeline renderer initialized.' });
      sendReadyOnce();
    } catch (err) {
      reportWebviewError('bootstrap.main', err);
      sendReadyOnce();
    }
  </script>
</body>
</html>`;
  }

  private getFallbackHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 10px; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    .hdr { font-weight: 800; margin-bottom: 8px; display: flex; gap: 8px; align-items: center; }
    .chip { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; font-size: 11px; }
    .section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
    .head { padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 700; background: var(--vscode-editorWidget-background); }
    .btn { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; }
    .body { padding: 8px; }
    .collapsed .body { display: none; }
    .row { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 6px; margin-bottom: 6px; }
    .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
    .title { font-weight: 700; }
    .detail { margin-top: 2px; white-space: pre-wrap; word-break: break-word; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div class="hdr">FlowTest Run Center <span class="chip">Fallback UI</span></div>
  <div id="run" class="section">
    <div class="head">Run Center <button id="runT" class="btn" type="button">toggle</button></div>
    <div class="body">
      <div id="runState" class="chip">Initializing</div>
      <div id="runMeta" class="meta" style="margin-top:6px;">waiting for init...</div>
    </div>
  </div>
  <div id="tl" class="section">
    <div class="head">Live Timeline <div><button id="fake" class="btn" type="button">fake</button> <button id="tlT" class="btn" type="button">toggle</button></div></div>
    <div class="body">
      <div id="timeline"></div>
      <div id="summary" class="meta">Status: Running...</div>
    </div>
  </div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const timeline = document.getElementById('timeline');
    const runMeta = document.getElementById('runMeta');
    const runState = document.getElementById('runState');
    const summary = document.getElementById('summary');
    document.getElementById('runT').addEventListener('click', () => document.getElementById('run').classList.toggle('collapsed'));
    document.getElementById('tlT').addEventListener('click', () => document.getElementById('tl').classList.toggle('collapsed'));
    document.getElementById('fake').addEventListener('click', () => {
      ['Intake','API Spec','Engine Run'].forEach((s, i) => {
        setTimeout(() => addEvent({ time: new Date().toLocaleTimeString([], { hour12: false }), stage: s, title: i === 1 ? 'Ai Request Dispatched' : 'Completed', detail: 'fallback local fake', status: i === 1 ? 'running' : 'success' }), i * 280);
      });
    });
    function addEvent(e) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<div class="meta">' + (e.time || '--') + ' • ' + (e.stage || '-') + ' • ' + (e.status || '-') + '</div>' +
                      '<div class="title">' + (e.title || '-') + '</div>' +
                      (e.detail ? '<div class="detail">' + e.detail + '</div>' : '');
      timeline.appendChild(row);
    }
    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'init') {
        const p = msg.payload || {};
        runMeta.textContent = 'run=' + (p.runName || '-') + ' | orch=' + (p.orchestrationId || '-') + ' | mode=' + (p.intakeMode || '-');
        runState.textContent = 'Running';
      }
      if (msg.type === 'event') addEvent(msg.payload || {});
      if (msg.type === 'summary') {
        const p = msg.payload || {};
        summary.textContent = 'Status: ' + (p.status || '-') + (p.detail ? (' — ' + p.detail) : '');
        runState.textContent = p.status || 'Running';
      }
    });
    vscodeApi.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
