import * as vscode from "vscode";

type RunInitPayload = {
  runName: string;
  orchestrationId: string;
  temporalLink: string;
  successCount: number;
  failureCount: number;
  intakeMode: string;
};

type EventPayload = {
  time: string;
  stage: string;
  status: "running" | "success" | "warn" | "error" | "info";
  title: string;
  detail?: string;
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
      }
    });
    const html = this.getHtml();
    console.log("[FlowTestStatusPanel] set main html, len=", html.length);
    this.panel.webview.html = html;
    setTimeout(() => {
      if (!this.webviewReady) {
        console.error("[FlowTestStatusPanel] no ready handshake, switching to fallback UI");
        this.fallbackMode = true;
        this.panel.webview.html = this.getFallbackHtml();
      }
    }, 1500);
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
    .panelStack { margin-top: 12px; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
    .hero { padding: 12px; height: 100%; overflow: auto; }
    h1 { margin: 0; font-size: 16px; font-weight: 900; letter-spacing: 0.2px; }
    .chip { border: 1px solid var(--border); border-radius: 999px; padding: 3px 9px; font-size: 11px; color: var(--muted); background: color-mix(in srgb, var(--card) 82%, transparent); }
    .metaRich { margin-top: 8px; display: flex; flex-direction: column; gap: 7px; }
    .metaChip { border: 1px solid var(--border); border-radius: 10px; padding: 7px 8px; background: color-mix(in srgb, var(--card) 84%, transparent); width: 100%; }
    .metaChip .mk { display: block; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.35px; margin-bottom: 2px; font-weight: 800; }
    .metaChip .mv { display: block; font-size: 11px; color: var(--fg); font-weight: 700; white-space: normal; word-break: break-word; }
    .stats { margin-top: 10px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
    .tile { border: 1px solid var(--border); border-radius: 10px; padding: 8px; background: color-mix(in srgb, var(--card) 86%, transparent); }
    .tile .k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
    .tile .v { margin-top: 3px; font-size: 15px; font-weight: 900; }
    .tile.ok .v { color: var(--ok); }
    .tile.bad .v { color: var(--err); }
    .tile.mode .v { color: var(--info); text-transform: capitalize; }
    .section { border: 1px solid var(--border); border-radius: 12px; background: color-mix(in srgb, var(--card) 88%, transparent); box-shadow: var(--shadow); overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
    .section.grow { flex: 1 1 auto; min-height: 0; }
    .runSection { flex: 0 0 auto; }
    .runSection .sectionBody { max-height: 52vh; overflow: hidden; }
    .timelineSection { flex: 1 1 auto; min-height: 280px; }
    .sectionBody { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
    .section.collapsed .sectionBody { max-height: 0; opacity: 0; }
    .sectionHead { padding: 9px 10px; border-bottom: 1px solid var(--border); font-size: 11px; letter-spacing: 0.4px; text-transform: uppercase; font-weight: 900; color: var(--muted); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sectionHeadLeft, .sectionHeadRight { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .collapseBtn, .expandBtn { border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--card) 84%, transparent); color: var(--muted); font-size: 11px; font-weight: 900; cursor: pointer; }
    .collapseBtn { min-width: 22px; height: 20px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; }
    .expandBtn { padding: 1px 7px; }
    .collapseBtn svg, .expandBtn svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 180ms ease; }
    .followToggle { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid var(--border); border-radius: 999px; font-size: 10px; color: var(--muted); background: color-mix(in srgb, var(--card) 82%, transparent); text-transform: none; letter-spacing: 0; font-weight: 700; }
    .followToggle input { accent-color: var(--info); width: 12px; height: 12px; }
    .testBtn { border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 700; color: #9fd1ff; background: color-mix(in srgb, #9fd1ff 14%, transparent); cursor: pointer; }
    .timeline { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
    .event { border: 1px solid var(--border); border-radius: 10px; padding: 8px; background: color-mix(in srgb, var(--card) 84%, transparent); display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: flex-start; }
    .eventBody { max-height: 340px; overflow: hidden; }
    .event.compact .eventBody { max-height: 0; opacity: 0; }
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
    .timerPill { margin-left: auto; border: 1px solid color-mix(in srgb, var(--info) 48%, var(--border)); border-radius: 999px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; color: #9fd1ff; }
    .timerPill.hidden { display: none; }
    .timerPill.done { color: #9ef0b7; }
    .timerDot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .detail { color: var(--muted); margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
    .actions { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
    .actionBtn { border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--card) 84%, transparent); color: var(--fg); font-size: 10px; line-height: 1; padding: 4px 8px; cursor: pointer; }
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
    .closeBtn { border: 1px solid var(--border); border-radius: 8px; background: color-mix(in srgb, var(--card) 86%, transparent); color: var(--fg); font-size: 11px; padding: 3px 8px; cursor: pointer; }
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
          <div class="stats">
            <div class="tile ok"><div class="k">Success Samples</div><div class="v" id="successCount">0</div></div>
            <div class="tile bad"><div class="k">Failure Samples</div><div class="v" id="failureCount">0</div></div>
            <div class="tile mode"><div class="k">Mode</div><div class="v" id="intakeMode">-</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="section timelineSection grow" id="timelineSection">
      <div class="sectionHead">
        <div class="sectionHeadLeft">Live Timeline <button id="timelineCollapseBtn" class="collapseBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button></div>
        <div class="sectionHeadRight">
          <button id="fakeTimelineBtn" class="testBtn" type="button">Fake timeline</button>
          <label class="followToggle"><input id="followLogs" type="checkbox" checked /> Follow logs</label>
        </div>
      </div>
      <div class="sectionBody">
        <div class="timeline" id="timeline"></div>
        <div class="summary" id="summary"><b>Status:</b> Running...</div>
      </div>
    </div>
  </div>
  <div class="modal" id="detailModal">
    <div class="modalCard">
      <div class="modalHead">
        <div class="modalTitle" id="modalTitle">Details</div>
        <div class="modalActions">
          <button class="closeBtn" id="modalCopyBtn" type="button">Copy</button>
          <button class="closeBtn" id="modalDownloadBtn" type="button">Download</button>
          <button class="closeBtn" id="modalCloseBtn" type="button">Close</button>
        </div>
      </div>
      <div class="modalBody" id="modalBody"></div>
    </div>
  </div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const timeline = document.getElementById('timeline');
    const timelineSection = document.getElementById('timelineSection');
    const runCenterSection = document.getElementById('runCenterSection');
    const timelineCollapseBtn = document.getElementById('timelineCollapseBtn');
    const runCenterCollapseBtn = document.getElementById('runCenterCollapseBtn');
    const followLogs = document.getElementById('followLogs');
    const fakeTimelineBtn = document.getElementById('fakeTimelineBtn');
    const runState = document.getElementById('runState');
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
    const meta = { runName: '-', orchestrationId: '-', temporalLink: '-', outputPath: '-', wiremockBaseUrl: '-', allureResultsPath: '-', allureReportPath: '-', allureGenerateCommand: '-' };
    function metaHtml() {
      return '<div class="metaChip"><span class="mk">Run</span><span class="mv">' + meta.runName + '</span></div>' +
        '<div class="metaChip"><span class="mk">Orchestration</span><span class="mv">' + meta.orchestrationId + '</span></div>' +
        '<div class="metaChip"><span class="mk">Temporal</span><span class="mv">' + meta.temporalLink + '</span></div>' +
        '<div class="metaChip"><span class="mk">Output Path</span><span class="mv">' + meta.outputPath + '</span></div>' +
        '<div class="metaChip"><span class="mk">WireMock Base URL</span><span class="mv">' + meta.wiremockBaseUrl + '</span></div>' +
        '<div class="metaChip"><span class="mk">Allure Results</span><span class="mv">' + meta.allureResultsPath + '</span></div>' +
        '<div class="metaChip"><span class="mk">Allure Report</span><span class="mv">' + meta.allureReportPath + '</span></div>' +
        '<div class="metaChip"><span class="mk">Allure Command</span><span class="mv">' + meta.allureGenerateCommand + '</span></div>';
    }
    function renderMeta() { document.getElementById('runMeta').innerHTML = metaHtml(); }
    function updateLayout() {
      const rc = runCenterSection.classList.contains('collapsed');
      const tl = timelineSection.classList.contains('collapsed');
      runCenterSection.classList.remove('grow');
      timelineSection.classList.remove('grow');
      if (rc && !tl) timelineSection.classList.add('grow');
      if (tl && !rc) runCenterSection.classList.add('grow');
      if (!rc && !tl) timelineSection.classList.add('grow');
    }
    runCenterCollapseBtn.addEventListener('click', () => { runCenterSection.classList.toggle('collapsed'); updateLayout(); });
    timelineCollapseBtn.addEventListener('click', () => { timelineSection.classList.toggle('collapsed'); updateLayout(); });
    modalCloseBtn.addEventListener('click', () => detailModal.classList.remove('open'));
    modalCopyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(modalText || ''); } catch {} });
    modalDownloadBtn.addEventListener('click', () => {
      const blob = new Blob([modalText || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (modalName || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
    function mmss(s){ s=Math.max(0,s|0); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
    function stageKey(stage){ return String(stage||'').toLowerCase().trim(); }
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
          actions.push('<button class="actionBtn" data-id="' + id + '" type="button">' + (a.label || 'View') + '</button>');
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
      row.querySelector('.expandBtn').addEventListener('click', () => row.classList.toggle('compact'));
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
    }
    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'init') {
        const p = msg.payload || {};
        meta.runName = p.runName || '-'; meta.orchestrationId = p.orchestrationId || '-'; meta.temporalLink = p.temporalLink || '-';
        meta.outputPath = '-'; meta.wiremockBaseUrl = '-'; meta.allureResultsPath = '-'; meta.allureReportPath = '-'; meta.allureGenerateCommand = '-';
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
    fakeTimelineBtn.addEventListener('click', async () => {
      const now = new Date();
      const mk = (s) => new Date(now.getTime() + s * 1000).toLocaleTimeString([], { hour12: false });
      const rows = [
        { time: mk(0), stage: 'Intake', status: 'running', title: 'Normalized', detail: 'Local fake event for UI verification' },
        { time: mk(1), stage: 'API Spec', status: 'running', title: 'Ai Request Dispatched', detail: 'Testing timer + row rendering' },
        { time: mk(3), stage: 'API Spec', status: 'success', title: 'Ai Response Received', detail: 'Timer should persist on row' },
        { time: mk(4), stage: 'Engine Run', status: 'success', title: 'Completed', detail: 'Timeline and collapse verified' }
      ];
      setSummary('Running', 'Injecting fake timeline events...');
      for (const r of rows) { addEvent(r); await new Promise((res) => setTimeout(res, 220)); }
      setSummary('Completed', 'Fake timeline run completed.');
    });
    renderMeta();
    updateLayout();
    addEvent({ time: new Date().toLocaleTimeString([], { hour12: false }), stage: 'UI', status: 'info', title: 'Webview Ready', detail: 'Timeline renderer initialized.' });
    vscodeApi.postMessage({ type: 'ready' });
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
