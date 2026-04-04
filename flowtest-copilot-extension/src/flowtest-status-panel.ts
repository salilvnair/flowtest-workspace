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
        console.error("[FlowTestStatusPanel] no ready handshake; keeping main UI (fallback auto-switch disabled)");
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
    .runSection { flex: 0 0 auto; }
    .runSection .sectionBody {
      max-height: 52vh;
      overflow: hidden;
      transition: max-height 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease;
    }
    .runSection.grow .sectionBody { max-height: none; }
    .runSection .hero {
      flex: 1 1 auto;
      min-height: 0;
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
    .title { font-weight: 700; }
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
    .detail { color: var(--muted); margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
    .actions { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
    .actionBtn { border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--card) 84%, transparent); color: var(--fg); font-size: 10px; line-height: 1; padding: 4px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
    .actionBtn.ai { color: #c0c6ff; border-color: color-mix(in srgb, #c0c6ff 50%, var(--border)); background: color-mix(in srgb, #c0c6ff 16%, transparent); }
    .actionBtn.file { color: #9be7ff; border-color: color-mix(in srgb, #9be7ff 50%, var(--border)); background: color-mix(in srgb, #9be7ff 16%, transparent); }
    .actionBtn.engine { color: #ffb3a5; border-color: color-mix(in srgb, #ffb3a5 50%, var(--border)); background: color-mix(in srgb, #ffb3a5 16%, transparent); }
    .summary { padding: 9px 10px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
    .summary b { color: var(--fg); }
    .stateComplete { color: #9ef0b7; }
    .stateFail { color: #ff9db7; }
    .modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.48); display: none; align-items: center; justify-content: center; padding: 18px; z-index: 99; }
    .modal.open { display: flex; }
    .modalCard { width: min(100%, 980px); max-height: 84vh; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }
    .modalHead { padding: 8px 10px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
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
    .modalBody { margin: 0; padding: 10px; overflow: auto; white-space: normal; word-break: normal; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; color: var(--fg); background: color-mix(in srgb, var(--card) 74%, transparent); flex: 1 1 auto; min-height: 0; }
    .codeFrame { margin: 0; border-radius: 8px; border: 1px solid var(--border); overflow: auto; background: #0d1117; }
    .codeFrame code { display: block; padding: 12px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.45; white-space: pre; }
    .codeLang { margin-bottom: 6px; display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 10px; color: #9fd1ff; background: color-mix(in srgb, #9fd1ff 16%, transparent); text-transform: uppercase; font-weight: 700; letter-spacing: 0.2px; }
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
          <span id="fakeTimelineBtn" class="testBtn">Fake timeline</span>
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
      <div class="modalBody" id="modalBody"></div>
    </div>
  </div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    let readySent = false;
    function sendReadyOnce() {
      if (readySent) return;
      readySent = true;
      vscodeApi.postMessage({ type: 'ready' });
    }
    sendReadyOnce();
    const panelStack = document.querySelector('.panelStack');
    const timeline = document.getElementById('timeline');
    const timelineSection = document.getElementById('timelineSection');
    const runCenterSection = document.getElementById('runCenterSection');
    const sectionDivider = document.getElementById('sectionDivider');
    const timelineCollapseBtn = document.getElementById('timelineCollapseBtn');
    const runCenterCollapseBtn = document.getElementById('runCenterCollapseBtn');
    const followLogs = document.getElementById('followLogs');
    const fakeTimelineBtn = document.getElementById('fakeTimelineBtn');
    const runState = document.getElementById('runState');
    const runMetaWrap = document.getElementById('runMeta');
    const runMetaDockWrap = document.getElementById('runMetaDockWrap');
    const runMetaDock = document.getElementById('runMetaDock');
    const runMetaDockGrid = document.getElementById('runMetaDockGrid');
    const runMetaDockLauncher = document.getElementById('runMetaDockLauncher');
    const runMetaDockHead = document.querySelector('.runMetaDockHead');
    const runMetaDockClose = document.getElementById('runMetaDockClose');
    const summary = document.getElementById('summary');
    const detailModal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCopyBtn = document.getElementById('modalCopyBtn');
    const modalDownloadBtn = document.getElementById('modalDownloadBtn');
    const detailStore = new Map();
    const aiTimers = new Map();
    let detailId = 0;
    let modalText = '';
    let modalName = 'detail';
    let dividerDrag = null;
    let manualRunHeight = null;
    let dockDrag = null;
    let dockOffsetX = 0;
    let dockOffsetY = 0;
    const meta = { runName: '-', orchestrationId: '-', temporalLink: '-', outputPath: '-', wiremockBaseUrl: '-', allureResultsPath: '-', allureReportPath: '-', allureGenerateCommand: '-' };
    function applyDockTransform() {
      runMetaDockWrap.style.transform = 'translate(' + dockOffsetX + 'px, ' + dockOffsetY + 'px)';
    }
    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function asMetaText(v) {
      const raw = String(v || '-').trim();
      return raw ? raw : '-';
    }
    function metaCopyButton(copyValue) {
      if (!copyValue || copyValue === '-') {
        return '';
      }
      return '<button class="metaCopyBtn" type="button" data-copy="' + esc(copyValue) + '" title="Copy">' +
        '<svg class="metaCopy" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1 -2 -2V4a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v1"></path></svg>' +
        '<svg class="metaCheck" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>' +
      '</button>';
    }
    function metaHtml() {
      const run = asMetaText(meta.runName);
      const orchestration = asMetaText(meta.orchestrationId);
      return '<div class="metaChip"><span class="mk">Run</span><span class="mv"><span class="metaValueText">' + esc(run) + '</span>' + metaCopyButton(run) + '</span></div>' +
        '<div class="metaChip"><span class="mk">Orchestration</span><span class="mv"><span class="metaValueText">' + esc(orchestration) + '</span>' + metaCopyButton(orchestration) + '</span></div>';
    }
    function renderMetaDock() {
      const temporal = String(meta.temporalLink || '-');
      const outputPath = String(meta.outputPath || '-');
      const wiremock = String(meta.wiremockBaseUrl || '-');
      const allureResults = String(meta.allureResultsPath || '-');
      const allureReport = String(meta.allureReportPath || '-');
      const temporalView = temporal && temporal !== '-'
        ? '<a href="#" data-open-url="' + esc(temporal) + '">' + esc(temporal) + '</a>'
        : '<span class="runMetaDockValText">-</span>';
      const outputView = '<span class="runMetaDockValText">' + esc(outputPath) + '</span>';
      const wiremockView = '<span class="runMetaDockValText">' + esc(wiremock) + '</span>';
      const allureResultsView = '<span class="runMetaDockValText">' + esc(allureResults) + '</span>';
      const allureReportView = '<span class="runMetaDockValText">' + esc(allureReport) + '</span>';
      const keyIcon = {
        temporal: '<svg viewBox="0 0 24 24"><path d="M3 12h18"></path><path d="M12 3v18"></path><circle cx="12" cy="12" r="8"></circle></svg>',
        output: '<svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M4 12h10"></path><path d="M4 17h16"></path></svg>',
        wiremock: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M8 12h8"></path><path d="M16.6 7.4l-5.2 3.2"></path><path d="M11.4 13.4l5.2 3.2"></path></svg>',
        allureResults: '<svg viewBox="0 0 24 24"><path d="M4 20h16"></path><path d="M7 16v-5"></path><path d="M12 16V8"></path><path d="M17 16v-3"></path></svg>',
        allureReport: '<svg viewBox="0 0 24 24"><path d="M6 3h9l5 5v13H6z"></path><path d="M15 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path></svg>'
      };
      runMetaDockGrid.innerHTML =
        '<div class="runMetaDockItem"><div class="runMetaDockKey">' + keyIcon.temporal + 'Temporal</div><div class="runMetaDockVal">' + temporalView + metaCopyButton(temporal) + '</div></div>' +
        '<div class="runMetaDockItem"><div class="runMetaDockKey">' + keyIcon.output + 'Output Path</div><div class="runMetaDockVal">' + outputView + metaCopyButton(outputPath) + '</div></div>' +
        '<div class="runMetaDockItem"><div class="runMetaDockKey">' + keyIcon.wiremock + 'WireMock Base URL</div><div class="runMetaDockVal">' + wiremockView + metaCopyButton(wiremock) + '</div></div>' +
        '<div class="runMetaDockItem"><div class="runMetaDockKey">' + keyIcon.allureResults + 'Allure Results</div><div class="runMetaDockVal">' + allureResultsView + metaCopyButton(allureResults) + '</div></div>' +
        '<div class="runMetaDockItem"><div class="runMetaDockKey">' + keyIcon.allureReport + 'Allure Report</div><div class="runMetaDockVal">' + allureReportView + metaCopyButton(allureReport) + '</div></div>';
    }
    function renderMeta() {
      document.getElementById('runMeta').innerHTML = metaHtml();
      renderMetaDock();
    }
    function syncChevronState(btn, isCollapsed) {
      if (!btn) return;
      btn.classList.toggle('is-collapsed', Boolean(isCollapsed));
      btn.setAttribute('aria-expanded', String(!isCollapsed));
    }
    document.getElementById('runMeta').addEventListener('click', async (event) => {
      const copyBtn = event.target && event.target.closest ? event.target.closest('.metaCopyBtn') : null;
      if (copyBtn) {
        const copyValue = copyBtn.getAttribute('data-copy') || '';
        try { await navigator.clipboard.writeText(copyValue); } catch {}
        copyBtn.classList.remove('copied');
        void copyBtn.offsetWidth;
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 850);
        return;
      }
      const link = event.target && event.target.closest ? event.target.closest('.metaValueLink[data-open-url]') : null;
      if (link) {
        event.preventDefault();
        const url = link.getAttribute('data-open-url') || '';
        vscodeApi.postMessage({ type: 'openExternal', url });
      }
    });
    runMetaDock.addEventListener('click', (event) => {
      const copyBtn = event.target && event.target.closest ? event.target.closest('.metaCopyBtn') : null;
      if (copyBtn) {
        event.preventDefault();
        const copyValue = copyBtn.getAttribute('data-copy') || '';
        navigator.clipboard.writeText(copyValue).catch(() => {});
        copyBtn.classList.remove('copied');
        void copyBtn.offsetWidth;
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 850);
        return;
      }
      const link = event.target && event.target.closest ? event.target.closest('[data-open-url]') : null;
      if (!link) return;
      event.preventDefault();
      const url = link.getAttribute('data-open-url') || '';
      vscodeApi.postMessage({ type: 'openExternal', url });
    });
    runMetaDockClose.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
    runMetaDockClose.addEventListener('click', (event) => {
      event.stopPropagation();
      runMetaDockWrap.classList.add('collapsed');
      runMetaDockLauncher.classList.add('show');
    });
    runMetaDockLauncher.addEventListener('click', () => {
      runMetaDockWrap.classList.remove('collapsed');
      runMetaDockWrap.classList.add('show');
      runMetaDockLauncher.classList.remove('show');
    });
    runMetaDockHead.addEventListener('mousedown', (event) => {
      if (!runMetaDockWrap.classList.contains('show') || runMetaDockWrap.classList.contains('collapsed')) return;
      dockDrag = { startX: event.clientX, startY: event.clientY, baseX: dockOffsetX, baseY: dockOffsetY };
      runMetaDockWrap.classList.add('dragging');
      event.preventDefault();
    });
    timeline.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest ? event.target.closest('.expandBtn') : null;
      if (!btn) return;
      const row = btn.closest('.event');
      if (!row) return;
      row.classList.toggle('compact');
      syncChevronState(btn, row.classList.contains('compact'));
      btn.setAttribute('title', row.classList.contains('compact') ? 'Expand' : 'Collapse');
      event.preventDefault();
      event.stopPropagation();
    });
    function updateLayout() {
      const rc = runCenterSection.classList.contains('collapsed');
      const tl = timelineSection.classList.contains('collapsed');
      sectionDivider.style.display = (!rc && !tl) ? 'block' : 'none';
      runCenterSection.classList.remove('grow');
      timelineSection.classList.remove('grow');
      if (rc && tl) {
        runCenterSection.style.flex = '0 0 auto';
        timelineSection.style.flex = '0 0 auto';
        return;
      }
      if (rc && !tl) {
        runCenterSection.style.flex = '0 0 auto';
        timelineSection.style.flex = '1 1 auto';
        timelineSection.classList.add('grow');
        return;
      }
      if (tl && !rc) {
        timelineSection.style.flex = '0 0 auto';
        runCenterSection.style.flex = '1 1 auto';
        runCenterSection.classList.add('grow');
        return;
      }
      if (!rc && !tl) {
        if (manualRunHeight && manualRunHeight > 0) {
          runCenterSection.style.flex = '0 0 ' + Math.round(manualRunHeight) + 'px';
          timelineSection.style.flex = '1 1 auto';
        } else {
          runCenterSection.style.flex = '';
          timelineSection.style.flex = '';
        }
        timelineSection.classList.add('grow');
      }
    }
    sectionDivider.addEventListener('mousedown', (e) => {
      if (runCenterSection.classList.contains('collapsed') || timelineSection.classList.contains('collapsed')) return;
      const runRect = runCenterSection.getBoundingClientRect();
      const stackRect = panelStack.getBoundingClientRect();
      dividerDrag = { startY: e.clientY, startRun: runRect.height, stackH: stackRect.height };
      sectionDivider.classList.add('dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (dockDrag) {
        const nextX = dockDrag.baseX + (e.clientX - dockDrag.startX);
        const nextY = dockDrag.baseY + (e.clientY - dockDrag.startY);
        const margin = 36;
        const clampX = Math.max(-(window.innerWidth - margin), Math.min(window.innerWidth - margin, nextX));
        const clampY = Math.max(-(window.innerHeight - margin), Math.min(window.innerHeight - margin, nextY));
        dockOffsetX = clampX;
        dockOffsetY = clampY;
        applyDockTransform();
      }
      if (!dividerDrag) return;
      const delta = e.clientY - dividerDrag.startY;
      const minTop = 180;
      const minBottom = 220;
      const maxTop = Math.max(minTop, dividerDrag.stackH - minBottom - sectionDivider.offsetHeight);
      const nextTop = Math.max(minTop, Math.min(maxTop, dividerDrag.startRun + delta));
      runCenterSection.style.flex = '0 0 ' + Math.round(nextTop) + 'px';
      timelineSection.style.flex = '1 1 auto';
    });
    window.addEventListener('mouseup', () => {
      if (dockDrag) {
        dockDrag = null;
        runMetaDockWrap.classList.remove('dragging');
      }
      if (!dividerDrag) return;
      const m = /^0 0 ([0-9]+)px$/.exec(String(runCenterSection.style.flex || ''));
      manualRunHeight = m ? Number(m[1]) : manualRunHeight;
      dividerDrag = null;
      sectionDivider.classList.remove('dragging');
    });
    runCenterCollapseBtn.addEventListener('click', () => {
      runCenterSection.classList.toggle('collapsed');
      syncChevronState(runCenterCollapseBtn, runCenterSection.classList.contains('collapsed'));
      updateLayout();
    });
    timelineCollapseBtn.addEventListener('click', () => {
      timelineSection.classList.toggle('collapsed');
      syncChevronState(timelineCollapseBtn, timelineSection.classList.contains('collapsed'));
      updateLayout();
    });
    modalCloseBtn.addEventListener('click', () => detailModal.classList.remove('open'));
    modalCopyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(modalText || ''); } catch {}
      modalCopyBtn.classList.remove('copied');
      void modalCopyBtn.offsetWidth;
      modalCopyBtn.classList.add('copied');
      setTimeout(() => modalCopyBtn.classList.remove('copied'), 900);
    });
    modalDownloadBtn.addEventListener('click', () => {
      modalDownloadBtn.classList.remove('downloading');
      void modalDownloadBtn.offsetWidth;
      modalDownloadBtn.classList.add('downloading');
      const blob = new Blob([modalText || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (modalName || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
      setTimeout(() => modalDownloadBtn.classList.remove('downloading'), 600);
    });
    function mmss(s){ s=Math.max(0,s|0); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
    function stageKey(stage){ return String(stage||'').toLowerCase().trim(); }
    function actionClass(label) {
      const l = String(label || '').toLowerCase();
      if (l.includes('ai')) return 'ai';
      if (l.includes('engine')) return 'engine';
      return 'file';
    }
    function actionIcon(label) {
      const l = String(label || '').toLowerCase();
      if (l.includes('ai')) return '{}';
      if (l.includes('engine')) return '▶';
      if (l.includes('dsl')) return '◇';
      if (l.includes('mock')) return '◈';
      return '▦';
    }
    function stageCls(stage){ return String(stage || '').toLowerCase().replace(/\s+/g, '-'); }
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
    function isLowSignalEvent(ev) {
      const stage = String(ev && ev.stage || '').toLowerCase().trim();
      const title = String(ev && ev.title || '').toLowerCase().trim();
      if (
        title === 'webview ready' ||
        title === 'started' ||
        title === 'status panel initialized' ||
        title === 'ai response received' ||
        title === 'ai request received' ||
        title === 'ai request dispatched' ||
        title.includes('ai request') ||
        title.includes('ai response') ||
        title === 'completed'
      ) return true;
      if (stage === 'ui' && (title.includes('ready') || title.includes('initialized') || title.includes('started'))) return true;
      return false;
    }
    function startTimer(stage, node){
      const k = stageKey(stage);
      const old = aiTimers.get(k); if (old && old.id) clearInterval(old.id);
      const started = Date.now();
      node.classList.remove('hidden','done');
      const text = node.querySelector('.timerText');
      text.textContent = '⏱ 00:00';
      const id = setInterval(() => { text.textContent = '⏱ ' + mmss(Math.floor((Date.now()-started)/1000)); }, 1000);
      aiTimers.set(k, { started, id, node });
    }
    function stopTimer(stage){
      const k = stageKey(stage);
      const t = aiTimers.get(k); if (!t) return;
      if (t.id) clearInterval(t.id);
      const sec = Math.floor((Date.now()-t.started)/1000);
      const text = t.node.querySelector('.timerText');
      text.textContent = '⏱ ' + mmss(sec);
      t.node.classList.add('done');
      aiTimers.delete(k);
    }
    function addEvent(ev){
      const row = document.createElement('div');
      row.className = 'event compact';
      if (isLowSignalEvent(ev)) row.classList.add('lowSignal');
      const sm = statusMeta(ev.status);
      const cm = controlForStage(ev.stage);
      const sc = stageCls(ev.stage);
      const idPrefix = 'd_' + (++detailId);
      const actions = [];
      if (Array.isArray(ev.actions)) {
        for (let i=0;i<ev.actions.length;i++){
          const a = ev.actions[i];
          const id = idPrefix + '_' + i;
          detailStore.set(id, { title: a.title || a.label || 'Details', content: a.content || '' });
          const cls = actionClass(a.label);
          const icon = actionIcon(a.label);
          actions.push('<button class="actionBtn ' + cls + '" data-id="' + id + '" type="button">' + icon + ' ' + (a.label || 'View') + '</button>');
        }
      }
      row.innerHTML =
        '<span class="dot"></span><div>' +
        '<div class="rowTop"><span class="time">' + (ev.time || '') + '</span>' +
        '<span class="stageTag ' + sc + '">' + (ev.stage || '') + '</span>' +
        '<span class="statusPill ' + sm.cls + '">' + sm.text + '</span>' +
        '<span class="controlChip ' + cm.cls + '">' + cm.text + '</span>' +
        '<span class="titleWrap"><span class="title">' + (ev.title || '') + '</span>' +
        '<button class="expandBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button>' +
        '<span class="timerPill hidden"><span class="timerDot"></span><span class="timerText">⏱ 00:00</span></span></span></div>' +
        '<div class="eventBody">' + (ev.detail ? '<div class="detail">' + ev.detail + '</div>' : '') + (actions.length ? '<div class="actions">' + actions.join('') + '</div>' : '') + '</div></div>';
      timeline.appendChild(row);
      const rowExpandBtn = row.querySelector('.expandBtn');
      const syncRowExpandState = () => {
        const isCompact = row.classList.contains('compact');
        syncChevronState(rowExpandBtn, isCompact);
        rowExpandBtn.setAttribute('title', isCompact ? 'Expand' : 'Collapse');
      };
      syncRowExpandState();
      row.querySelectorAll('.actionBtn').forEach((b) => b.addEventListener('click', () => {
        const p = detailStore.get(b.getAttribute('data-id')); if (!p) return;
        modalName = p.title; modalText = p.content;
        modalTitle.textContent = modalName;
        modalBody.innerHTML = '<pre class="codeFrame"><code>' + String(modalText).replace(/</g, '&lt;') + '</code></pre>';
        detailModal.classList.add('open');
      }));
      const title = String(ev.title || '').toLowerCase();
      const timer = row.querySelector('.timerPill');
      if (title.includes('ai request dispatched')) startTimer(ev.stage, timer);
      if (title.includes('ai response received') || title.includes('completed') || title.includes('failed')) stopTimer(ev.stage);
      if (followLogs.checked) timeline.scrollTop = timeline.scrollHeight;
    }
    function setSummary(status, detail){
      summary.innerHTML = '<b>Status:</b> ' + (status || '-') + (detail ? (' — ' + detail) : '');
      runState.textContent = String(status || 'Running');
      runState.classList.remove('stateComplete','stateFail');
      const s = String(status || '').toLowerCase();
      if (s.includes('fail')) runState.classList.add('stateFail');
      if (s.includes('complete') || s.includes('success')) runState.classList.add('stateComplete');
      const isDone = s.includes('complete') || s.includes('success');
      runMetaDockWrap.classList.toggle('show', isDone);
      if (!isDone) {
        runMetaDockWrap.classList.remove('collapsed');
        runMetaDockLauncher.classList.remove('show');
      } else if (!runMetaDockWrap.classList.contains('collapsed')) {
        runMetaDockLauncher.classList.remove('show');
      }
    }
    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'init') {
        const p = msg.payload || {};
        meta.runName = p.runName || '-'; meta.orchestrationId = p.orchestrationId || '-'; meta.temporalLink = p.temporalLink || '-';
        meta.outputPath = p.outputPath || 'pending (.flowtest-runs)';
        meta.wiremockBaseUrl = p.wiremockBaseUrl || 'pending (engine will publish base URL)';
        meta.allureResultsPath = '-'; meta.allureReportPath = '-'; meta.allureGenerateCommand = '-';
        renderMeta();
        document.getElementById('successCount').textContent = String(p.successCount ?? 0);
        document.getElementById('failureCount').textContent = String(p.failureCount ?? 0);
        document.getElementById('intakeMode').textContent = String(p.intakeMode || '-');
      }
      if (msg.type === 'temporal') { const p = msg.payload || {}; if (p.temporalLink) { meta.temporalLink = p.temporalLink; renderMeta(); } }
      if (msg.type === 'meta') {
        const p = msg.payload || {};
        if (p.outputPath) meta.outputPath = p.outputPath;
        if (p.wiremockBaseUrl) meta.wiremockBaseUrl = p.wiremockBaseUrl;
        if (p.allureResultsPath) meta.allureResultsPath = p.allureResultsPath;
        if (p.allureReportPath) meta.allureReportPath = p.allureReportPath;
        if (p.allureGenerateCommand) meta.allureGenerateCommand = p.allureGenerateCommand;
        renderMeta();
      }
      if (msg.type === 'event') addEvent(msg.payload || {});
      if (msg.type === 'summary') { const p = msg.payload || {}; setSummary(p.status || '-', p.detail); }
    });
    // Display-only chip; click behavior intentionally disabled.
    renderMeta();
    syncChevronState(runCenterCollapseBtn, runCenterSection.classList.contains('collapsed'));
    syncChevronState(timelineCollapseBtn, timelineSection.classList.contains('collapsed'));
    updateLayout();
    addEvent({ time: new Date().toLocaleTimeString([], { hour12: false }), stage: 'UI', status: 'info', title: 'Webview Ready', detail: 'Timeline renderer initialized.' });
    sendReadyOnce();
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
