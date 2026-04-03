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
    :root { --border: var(--vscode-panel-border); --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --muted: var(--vscode-descriptionForeground); --card: var(--vscode-editorWidget-background); }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 10px; font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); height: 100vh; overflow: hidden; display: flex; flex-direction: column; gap: 8px; }
    .section { border: 1px solid var(--border); border-radius: 10px; background: var(--card); overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
    .section.grow { flex: 1 1 auto; }
    .sectionHead { padding: 7px 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--muted); }
    .sectionHeadLeft, .sectionHeadRight { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
    .sectionBody { padding: 8px; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
    .collapsed .sectionBody { display: none; }
    .chip { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 10px; color: var(--muted); background: rgba(127,127,127,0.08); white-space: nowrap; }
    .btn { border: 1px solid var(--border); border-radius: 999px; background: transparent; color: inherit; padding: 2px 8px; cursor: pointer; font-size: 10px; }
    .btn:hover { color: var(--fg); }
    .metaGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px; }
    .metaItem { border: 1px solid var(--border); border-radius: 8px; padding: 6px; font-size: 11px; }
    .metaItem .k { color: var(--muted); text-transform: uppercase; font-size: 10px; margin-bottom: 2px; }
    .metaItem .v { font-weight: 700; word-break: break-word; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
    .tile { border: 1px solid var(--border); border-radius: 8px; padding: 6px; }
    .tile .k { color: var(--muted); font-size: 10px; text-transform: uppercase; }
    .tile .v { font-size: 15px; font-weight: 900; }
    .timeline { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 7px; }
    .event { border: 1px solid var(--border); border-radius: 8px; padding: 7px; display: flex; flex-direction: column; gap: 6px; background: rgba(127,127,127,0.04); }
    .rowTop { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .time { color: var(--muted); font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
    .stage { border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; font-size: 10px; }
    .status { border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; font-size: 10px; }
    .control { border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; font-size: 10px; color: var(--muted); }
    .title { font-weight: 700; }
    .timer { margin-left: auto; border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; font-size: 10px; color: #9fd1ff; }
    .timer.done { color: #9ef0b7; }
    .expandBtn { border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--muted); font-size: 10px; padding: 1px 7px; cursor: pointer; }
    .eventBody { display: block; }
    .event.compact .eventBody { display: none; }
    .detail { color: var(--muted); white-space: pre-wrap; word-break: break-word; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .actionBtn { border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--fg); padding: 2px 8px; font-size: 10px; cursor: pointer; }
    .summary { border-top: 1px solid var(--border); padding: 8px; font-size: 12px; color: var(--muted); }
    .stateFail { color: #ff9db7; }
    .stateDone { color: #9ef0b7; }
    .modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); padding: 14px; }
    .modal.open { display: flex; }
    .modalCard { width: min(100%, 980px); max-height: 86vh; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
    .modalHead { padding: 8px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .modalBody { padding: 8px; overflow: auto; flex: 1 1 auto; min-height: 0; }
    .modalBody pre { margin: 0; font-family: var(--vscode-editor-font-family, monospace); white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="section" id="runSection">
    <div class="sectionHead">
      <div class="sectionHeadLeft">FlowTest Run Center <span class="chip">Main UI Stable</span></div>
      <div class="sectionHeadRight"><span class="chip" id="runState">Initializing</span><button class="btn" id="runToggle" type="button">collapse</button></div>
    </div>
    <div class="sectionBody">
      <div class="metaGrid" id="metaGrid"></div>
      <div class="stats">
        <div class="tile"><div class="k">Success</div><div class="v" id="successCount">0</div></div>
        <div class="tile"><div class="k">Failure</div><div class="v" id="failureCount">0</div></div>
        <div class="tile"><div class="k">Mode</div><div class="v" id="intakeMode">-</div></div>
      </div>
    </div>
  </div>
  <div class="section grow" id="timelineSection">
    <div class="sectionHead">
      <div class="sectionHeadLeft">Live Timeline</div>
      <div class="sectionHeadRight"><button class="btn" id="fakeBtn" type="button">fake timeline</button><label class="chip"><input id="followLogs" type="checkbox" checked /> follow</label><button class="btn" id="timelineToggle" type="button">collapse</button></div>
    </div>
    <div class="sectionBody">
      <div class="timeline" id="timeline"></div>
      <div class="summary" id="summary"><b>Status:</b> Running...</div>
    </div>
  </div>
  <div class="modal" id="modal">
    <div class="modalCard">
      <div class="modalHead"><div id="modalTitle">Details</div><div><button class="btn" id="copyBtn" type="button">copy</button> <button class="btn" id="downloadBtn" type="button">download</button> <button class="btn" id="closeBtn" type="button">close</button></div></div>
      <div class="modalBody"><pre id="modalContent"></pre></div>
    </div>
  </div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    console.log('[FlowTestStatusPanel:webview] main stable boot');
    const runSection = document.getElementById('runSection');
    const timelineSection = document.getElementById('timelineSection');
    const runToggle = document.getElementById('runToggle');
    const timelineToggle = document.getElementById('timelineToggle');
    const fakeBtn = document.getElementById('fakeBtn');
    const followLogs = document.getElementById('followLogs');
    const timeline = document.getElementById('timeline');
    const runState = document.getElementById('runState');
    const summary = document.getElementById('summary');
    const metaGrid = document.getElementById('metaGrid');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    const closeBtn = document.getElementById('closeBtn');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const detailStore = new Map();
    const aiTimerByStage = new Map();
    let detailId = 0;
    let modalText = '';
    let modalName = 'detail';
    const meta = { runName: '-', orchestrationId: '-', temporalLink: '-', outputPath: '-', wiremockBaseUrl: '-', allureResultsPath: '-', allureReportPath: '-', allureGenerateCommand: '-' };

    function renderMeta() {
      metaGrid.innerHTML = '';
      [['Run', meta.runName], ['Orchestration', meta.orchestrationId], ['Temporal', meta.temporalLink], ['Output Path', meta.outputPath], ['WireMock', meta.wiremockBaseUrl], ['Allure Results', meta.allureResultsPath], ['Allure Report', meta.allureReportPath], ['Allure Command', meta.allureGenerateCommand]].forEach((r) => {
        const item = document.createElement('div');
        item.className = 'metaItem';
        const k = document.createElement('div'); k.className = 'k'; k.textContent = r[0];
        const v = document.createElement('div'); v.className = 'v'; v.textContent = r[1] || '-';
        item.appendChild(k); item.appendChild(v);
        metaGrid.appendChild(item);
      });
    }

    function updateLayout() {
      const runCollapsed = runSection.classList.contains('collapsed');
      const tlCollapsed = timelineSection.classList.contains('collapsed');
      runSection.classList.remove('grow');
      timelineSection.classList.remove('grow');
      if (runCollapsed && !tlCollapsed) timelineSection.classList.add('grow');
      if (tlCollapsed && !runCollapsed) runSection.classList.add('grow');
      if (!runCollapsed && !tlCollapsed) timelineSection.classList.add('grow');
    }

    runToggle.addEventListener('click', () => { runSection.classList.toggle('collapsed'); updateLayout(); });
    timelineToggle.addEventListener('click', () => { timelineSection.classList.toggle('collapsed'); updateLayout(); });

    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    copyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(modalText || ''); } catch {} });
    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([modalText || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (modalName || 'detail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

    function statusText(s) {
      if (s === 'success') return 'Done';
      if (s === 'error') return 'Error';
      if (s === 'warn') return 'Warn';
      if (s === 'running') return 'Running';
      return 'Info';
    }
    function controlFromStage(stage) {
      const s = String(stage || '').toLowerCase();
      if (s === 'api spec' || s === 'wiremock' || s === 'scenario dsl') return 'LLM';
      if (s === 'engine run') return 'Java';
      return 'VS Code Copilot';
    }
    function mmss(sec) { const s = Math.max(0, sec|0); return String(Math.floor(s/60)).padStart(2, '0') + ':' + String(s%60).padStart(2, '0'); }
    function stageKey(stage) { return String(stage || '').toLowerCase().trim(); }

    function startTimer(stage, timerEl) {
      const key = stageKey(stage);
      const old = aiTimerByStage.get(key);
      if (old && old.id) clearInterval(old.id);
      const started = Date.now();
      const obj = { started, el: timerEl, id: null };
      timerEl.style.display = 'inline-block';
      timerEl.classList.remove('done');
      timerEl.textContent = '⏱ 00:00';
      obj.id = setInterval(() => {
        const sec = Math.floor((Date.now() - started) / 1000);
        timerEl.textContent = '⏱ ' + mmss(sec);
      }, 1000);
      aiTimerByStage.set(key, obj);
    }
    function stopTimer(stage) {
      const key = stageKey(stage);
      const obj = aiTimerByStage.get(key);
      if (!obj) return;
      if (obj.id) clearInterval(obj.id);
      const sec = Math.floor((Date.now() - obj.started) / 1000);
      obj.el.textContent = '⏱ ' + mmss(sec);
      obj.el.classList.add('done');
      aiTimerByStage.delete(key);
    }

    function addEvent(ev) {
      const row = document.createElement('div');
      row.className = 'event compact';
      const top = document.createElement('div');
      top.className = 'rowTop';
      const time = document.createElement('span'); time.className = 'time'; time.textContent = String(ev.time || '');
      const stage = document.createElement('span'); stage.className = 'stage'; stage.textContent = String(ev.stage || '');
      const st = document.createElement('span'); st.className = 'status'; st.textContent = statusText(ev.status);
      const ctrl = document.createElement('span'); ctrl.className = 'control'; ctrl.textContent = controlFromStage(ev.stage);
      const title = document.createElement('span'); title.className = 'title'; title.textContent = String(ev.title || '');
      const exp = document.createElement('button'); exp.className = 'expandBtn'; exp.type = 'button'; exp.textContent = 'expand';
      const timer = document.createElement('span'); timer.className = 'timer'; timer.style.display = 'none';
      exp.addEventListener('click', () => { row.classList.toggle('compact'); exp.textContent = row.classList.contains('compact') ? 'expand' : 'collapse'; });
      top.appendChild(time); top.appendChild(stage); top.appendChild(st); top.appendChild(ctrl); top.appendChild(title); top.appendChild(exp); top.appendChild(timer);

      const body = document.createElement('div');
      body.className = 'eventBody';
      if (ev.detail) {
        const d = document.createElement('div');
        d.className = 'detail';
        d.textContent = String(ev.detail);
        body.appendChild(d);
      }
      if (Array.isArray(ev.actions) && ev.actions.length > 0) {
        const actions = document.createElement('div');
        actions.className = 'actions';
        ev.actions.forEach((a) => {
          const id = 'd_' + (++detailId);
          detailStore.set(id, { title: a.title || a.label || 'Details', content: a.content || '' });
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'actionBtn';
          b.textContent = a.label || 'View';
          b.addEventListener('click', () => {
            const p = detailStore.get(id);
            modalName = p.title || 'detail';
            modalText = String(p.content || '');
            modalTitle.textContent = modalName;
            modalContent.textContent = modalText;
            modal.classList.add('open');
          });
          actions.appendChild(b);
        });
        body.appendChild(actions);
      }

      row.appendChild(top);
      row.appendChild(body);
      timeline.appendChild(row);
      if (followLogs.checked) timeline.scrollTop = timeline.scrollHeight;

      const t = String(ev.title || '').toLowerCase();
      if (t.includes('ai request dispatched')) startTimer(ev.stage, timer);
      if (t.includes('ai response received') || t.includes('completed') || t.includes('failed')) stopTimer(ev.stage);
    }

    function setSummary(status, detail) {
      summary.innerHTML = '<b>Status:</b> ' + String(status || '-') + (detail ? (' — ' + detail) : '');
      runState.textContent = String(status || 'Running');
      runState.classList.remove('stateFail', 'stateDone');
      const s = String(status || '').toLowerCase();
      if (s.includes('fail')) runState.classList.add('stateFail');
      if (s.includes('complete') || s.includes('success')) runState.classList.add('stateDone');
    }

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      console.log('[FlowTestStatusPanel:webview] inbound', msg.type);
      if (msg.type === 'init') {
        const p = msg.payload || {};
        meta.runName = p.runName || '-';
        meta.orchestrationId = p.orchestrationId || '-';
        meta.temporalLink = p.temporalLink || '-';
        meta.outputPath = '-';
        meta.wiremockBaseUrl = '-';
        meta.allureResultsPath = '-';
        meta.allureReportPath = '-';
        meta.allureGenerateCommand = '-';
        renderMeta();
        document.getElementById('successCount').textContent = String(p.successCount ?? 0);
        document.getElementById('failureCount').textContent = String(p.failureCount ?? 0);
        document.getElementById('intakeMode').textContent = String(p.intakeMode || '-');
      }
      if (msg.type === 'temporal') {
        const p = msg.payload || {};
        if (p.temporalLink) { meta.temporalLink = p.temporalLink; renderMeta(); }
      }
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

    fakeBtn.addEventListener('click', async () => {
      const base = new Date();
      const fmt = (d) => d.toLocaleTimeString([], { hour12: false });
      const mk = (s) => fmt(new Date(base.getTime() + (s * 1000)));
      const rows = [
        { time: mk(0), stage: 'Intake', status: 'running', title: 'Normalized', detail: 'Local fake timeline' },
        { time: mk(1), stage: 'API Spec', status: 'running', title: 'Ai Request Dispatched', detail: 'Timer test' },
        { time: mk(3), stage: 'API Spec', status: 'success', title: 'Ai Response Received', detail: 'Timer persisted' },
        { time: mk(4), stage: 'Engine Run', status: 'success', title: 'Completed', detail: 'Done' }
      ];
      setSummary('Running', 'Injecting fake timeline events...');
      for (const r of rows) {
        addEvent(r);
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      setSummary('Completed', 'Fake timeline complete');
    });

    window.addEventListener('error', (e) => {
      setSummary('Failed', 'Webview error: ' + String((e && e.message) || 'unknown'));
    });

    renderMeta();
    updateLayout();
    addEvent({ time: new Date().toLocaleTimeString([], { hour12: false }), stage: 'UI', status: 'info', title: 'Webview Ready', detail: 'Main stable renderer initialized.' });
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
