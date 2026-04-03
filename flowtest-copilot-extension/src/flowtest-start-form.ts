import * as vscode from "vscode";

export type IntakeDoc = {
  id: string;
  type: "SUCCESS_SAMPLE" | "FAILURE_SAMPLE" | "AID" | "HLD";
  title: string;
  content: string;
  fileName?: string;
};

export type StartIntakePayload = {
  runName: string;
  outputPath?: string;
  successSamples: IntakeDoc[];
  failureSamples: IntakeDoc[];
  aid: IntakeDoc | null;
  hld: IntakeDoc | null;
  additionalInfo?: string;
  multiUpload?: boolean;
  fakeRun?: boolean;
};

type SubmitMessage = {
  type: "submit";
  payload: StartIntakePayload;
};

type FakeMessage = { type: "fake" };
type CancelMessage = { type: "cancel" };

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function openStartIntakeForm(opts: {
  extensionUri: vscode.Uri;
  title?: string;
}): Promise<StartIntakePayload | null> {
  const panel = vscode.window.createWebviewPanel(
    "flowtestStartForm",
    opts.title ?? "FlowTest: Start Intake",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false }
  );
  panel.iconPath = vscode.Uri.joinPath(opts.extensionUri, "images", "flowtest_bot.svg");
  const n = nonce();
  panel.webview.html = getHtml(n);

  return await new Promise<StartIntakePayload | null>((resolve) => {
    const d1 = panel.onDidDispose(() => resolve(null));
    const d2 = panel.webview.onDidReceiveMessage((msg: SubmitMessage | CancelMessage | FakeMessage) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "cancel") {
        d1.dispose();
        d2.dispose();
        resolve(null);
        panel.dispose();
        return;
      }
      if (msg.type === "fake") {
        d1.dispose();
        d2.dispose();
        resolve({
          runName: "flowtest-fake-run",
          successSamples: [],
          failureSamples: [],
          aid: null,
          hld: null,
          additionalInfo: "",
          multiUpload: true,
          fakeRun: true
        });
        panel.dispose();
        return;
      }
      if (msg.type === "submit") {
        d1.dispose();
        d2.dispose();
        resolve(msg.payload);
        panel.dispose();
      }
    });
  });
}

function getHtml(n: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${n}">
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground, rgba(127,127,127,0.85));
      --border: color-mix(in srgb, var(--vscode-panel-border, rgba(127,127,127,0.35)) 75%, transparent);
      --card: color-mix(in srgb, var(--vscode-editorWidget-background, rgba(127,127,127,0.04)) 88%, transparent);
      --hover: color-mix(in srgb, var(--vscode-list-hoverBackground, rgba(127,127,127,0.09)) 88%, transparent);
      --focus: var(--vscode-focusBorder, #3794ff);
      --ok: var(--vscode-charts-green, #89d185);
      --bad: var(--vscode-charts-red, #f14c4c);
      --info: var(--vscode-charts-blue, #3794ff);
      --shadow: 0 10px 24px rgba(0,0,0,0.18);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      font-family: var(--vscode-font-family);
      color: var(--fg);
      background:
        radial-gradient(700px 300px at -10% -30%, color-mix(in srgb, var(--info) 14%, transparent), transparent 65%),
        radial-gradient(780px 340px at 115% 115%, color-mix(in srgb, var(--ok) 11%, transparent), transparent 65%),
        var(--bg);
      font-size: 12px;
      line-height: 1.35;
    }
    .wrap { max-width: 980px; margin: 0 auto; padding-bottom: 72px; }
    .hero {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(160deg, color-mix(in srgb, var(--card) 90%, transparent), color-mix(in srgb, var(--bg) 92%, transparent));
      padding: 10px 12px;
      box-shadow: var(--shadow);
      margin-bottom: 10px;
    }
    .heroHead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .hero h1 { margin: 0; font-size: 15px; font-weight: 900; letter-spacing: 0.2px; }
    .hint { color: var(--muted); margin-top: 4px; }
    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 800;
      color: var(--muted);
      background: color-mix(in srgb, var(--card) 82%, transparent);
      white-space: nowrap;
    }
    .stats {
      margin-top: 8px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0,1fr));
      gap: 7px;
    }
    .stat {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 7px;
      background: color-mix(in srgb, var(--card) 80%, transparent);
    }
    .stat .k { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
    .stat .v { margin-top: 1px; font-weight: 900; font-size: 14px; }
    .stat.ok .v { color: var(--ok); }
    .stat.bad .v { color: var(--bad); }
    .stat.info .v { color: var(--info); }

    .card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(160deg, color-mix(in srgb, var(--card) 88%, transparent), color-mix(in srgb, var(--bg) 95%, transparent));
      padding: 10px;
      margin-top: 9px;
      box-shadow: var(--shadow);
    }
    .title {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.35px;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 8px;
      display: flex;
      gap: 7px;
      align-items: center;
    }
    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      min-width: 52px;
      text-align: center;
      font-size: 9px;
      font-weight: 900;
      padding: 2px 8px;
    }
    .badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
    .badge.bad { color: var(--bad); background: color-mix(in srgb, var(--bad) 13%, transparent); }
    .badge.info { color: var(--info); background: color-mix(in srgb, var(--info) 13%, transparent); }

    .field { display: flex; flex-direction: column; gap: 4px; }
    .field > label { font-size: 11px; color: color-mix(in srgb, var(--fg) 78%, var(--muted)); }
    input, textarea {
      width: 100%;
      min-height: 30px;
      padding: 7px 9px;
      font-size: 12px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    textarea { min-height: 90px; resize: vertical; }
    input:focus, textarea:focus {
      outline: none;
      border-color: var(--focus);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--focus) 45%, transparent);
    }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

    .toggleRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px;
      background: color-mix(in srgb, var(--card) 76%, transparent);
      margin-top: 8px;
    }
    .toggleMeta b { font-size: 12px; }
    .toggleMeta div { color: var(--muted); font-size: 11px; margin-top: 2px; }
    .switch {
      position: relative;
      width: 42px;
      height: 24px;
      display: inline-block;
    }
    .switch input { display: none; }
    .slider {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--muted) 28%, transparent);
      border-radius: 999px;
      border: 1px solid var(--border);
      transition: all 140ms ease;
      cursor: pointer;
    }
    .slider:before {
      content: "";
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: white;
      border-radius: 50%;
      transition: transform 140ms ease;
    }
    .switch input:checked + .slider {
      background: color-mix(in srgb, var(--info) 38%, transparent);
      border-color: color-mix(in srgb, var(--info) 70%, var(--border));
    }
    .switch input:checked + .slider:before { transform: translateX(18px); }

    .hidden { display: none !important; }

    .dropzone {
      border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent);
      border-radius: 10px;
      padding: 10px;
      background: color-mix(in srgb, var(--card) 78%, transparent);
      text-align: center;
      color: var(--muted);
      font-size: 11px;
      transition: border-color 120ms ease, background 120ms ease;
      cursor: pointer;
    }
    .dropzone:hover, .dropzone.drag {
      border-color: color-mix(in srgb, var(--focus) 55%, var(--border));
      background: color-mix(in srgb, var(--hover) 68%, var(--card));
      color: var(--fg);
    }
    .chips {
      margin-top: 7px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: color-mix(in srgb, var(--card) 80%, transparent);
      color: var(--fg);
      padding: 3px 9px;
      font-size: 11px;
      cursor: pointer;
    }
    .chip:hover { border-color: color-mix(in srgb, var(--focus) 45%, var(--border)); }

    .row {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 9px;
      margin-top: 8px;
      background: color-mix(in srgb, var(--card) 84%, transparent);
    }
    .rowTop { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    .rowMeta {
      margin-top: 6px;
      padding: 5px 7px;
      border-radius: 8px;
      border: 1px dashed color-mix(in srgb, var(--border) 82%, transparent);
      color: var(--muted);
      font-size: 11px;
    }

    button {
      padding: 7px 11px;
      min-height: 32px;
      border-radius: 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
    }
    .btnPrimary {
      background: linear-gradient(120deg, var(--vscode-button-background), color-mix(in srgb, var(--vscode-button-background) 78%, var(--info)));
      color: var(--vscode-button-foreground);
    }
    .btnSecondary { background: transparent; color: var(--fg); border-color: var(--border); }
    .btnDanger { background: transparent; color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }

    .actions {
      position: sticky;
      bottom: 0;
      margin-top: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 9px;
      background: linear-gradient(to bottom, color-mix(in srgb, var(--card) 50%, transparent), color-mix(in srgb, var(--card) 96%, transparent));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .actionsRight { display: flex; gap: 6px; }
    .subtle { font-size: 11px; color: var(--muted); }

    .status {
      margin-top: 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .status b { color: var(--fg); }

    .modalBack {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 20;
      padding: 12px;
    }
    .modalBack.show { display: flex; }
    .modal {
      width: min(880px, 96vw);
      max-height: 88vh;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--bg);
      box-shadow: var(--shadow);
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr auto;
    }
    .modalHead {
      padding: 9px 10px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      font-weight: 700;
    }
    .modalBody {
      overflow: auto;
      padding: 10px;
    }
    .modalBody pre {
      margin: 0;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
      color: color-mix(in srgb, var(--fg) 92%, var(--muted));
    }
    .modalFoot {
      border-top: 1px solid var(--border);
      padding: 8px 10px;
      display: flex;
      justify-content: flex-end;
    }

    @media (max-width: 820px) {
      .stats { grid-template-columns: 1fr 1fr; }
      .grid2 { grid-template-columns: 1fr; }
      .rowTop { grid-template-columns: 1fr; }
      .actions { flex-direction: column; align-items: flex-start; }
      .actionsRight { width: 100%; justify-content: flex-end; }
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="heroHead">
      <h1>FlowTest Start Intake</h1>
      <div class="pill">@flowtest minimal consumer mode</div>
    </div>
    <div class="hint">Upload success/failure samples + AID + HLD. FlowTest handles heavy lifting.</div>
    <div class="stats">
      <div class="stat ok"><div class="k">Success</div><div class="v" id="metricSuccess">0</div></div>
      <div class="stat bad"><div class="k">Failure</div><div class="v" id="metricFailure">0</div></div>
      <div class="stat info"><div class="k">Docs</div><div class="v" id="metricDocs">0/2</div></div>
      <div class="stat info"><div class="k">Readiness</div><div class="v" id="metricReady">Draft</div></div>
    </div>
  </div>

  <div class="card">
    <div class="title"><span class="badge info">Run</span>Run Setup</div>
    <div class="grid2">
      <div class="field">
        <label>Run Name</label>
        <input id="runName" value="flowtest-zapper-run" />
      </div>
      <div class="field">
        <label>Output Path (optional)</label>
        <input id="outputPath" placeholder="/absolute/path/to/store/generated-outputs" />
      </div>
    </div>
    <div class="toggleRow">
      <div class="toggleMeta">
        <b>Multi Upload Mode</b>
        <div>ON: drag/drop many files with instant preview. OFF: existing row form mode.</div>
      </div>
      <label class="switch" title="Toggle multi upload mode">
        <input id="multiToggle" type="checkbox" checked />
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="card">
    <div class="title"><span class="badge ok">Success</span>Success Samples</div>

    <div id="successMultiWrap">
      <input id="successMultiFile" type="file" multiple class="hidden" accept=".json,.txt,.log,.md" />
      <div class="dropzone" id="successDropzone">Drop success sample files here, or click to upload multiple files</div>
      <div class="chips" id="successChips"></div>
    </div>

    <div id="successRowsWrap" class="hidden">
      <div id="successRows"></div>
      <div style="margin-top:8px;"><button class="btnSecondary" id="addSuccessBtn">+ Add Success Sample</button></div>
    </div>
  </div>

  <div class="card">
    <div class="title"><span class="badge bad">Failure</span>Failure Samples</div>

    <div id="failureMultiWrap">
      <input id="failureMultiFile" type="file" multiple class="hidden" accept=".json,.txt,.log,.md" />
      <div class="dropzone" id="failureDropzone">Drop failure sample files here, or click to upload multiple files</div>
      <div class="chips" id="failureChips"></div>
    </div>

    <div id="failureRowsWrap" class="hidden">
      <div id="failureRows"></div>
      <div style="margin-top:8px;"><button class="btnSecondary" id="addFailureBtn">+ Add Failure Sample</button></div>
    </div>
  </div>

  <div class="card hidden" id="additionalInfoCard">
    <div class="title"><span class="badge info">Prompt</span>Additional Information</div>
    <div class="field">
      <label>Extra context to include in AI prompt (row mode)</label>
      <textarea id="additionalInfo" placeholder="Add business rules, constraints, edge-cases, priorities, etc..."></textarea>
    </div>
  </div>

  <div class="card">
    <div class="title"><span class="badge info">Docs</span>AID & HLD</div>
    <div class="grid2">
      <div class="field">
        <label>AID (single file)</label>
        <input id="aidFile" type="file" accept=".json,.txt,.md,.csv,.xlsx,.doc,.docx" />
        <div class="dropzone" id="aidDropzone">Drop AID file here (single file), or click to upload</div>
        <div class="rowMeta" id="aidMeta">No AID file selected.</div>
        <textarea id="aidContent" placeholder="Or paste AID content here..."></textarea>
      </div>
      <div class="field">
        <label>HLD (single file)</label>
        <input id="hldFile" type="file" accept=".json,.txt,.md,.doc,.docx" />
        <div class="dropzone" id="hldDropzone">Drop HLD file here (single file), or click to upload</div>
        <div class="rowMeta" id="hldMeta">No HLD file selected.</div>
        <textarea id="hldContent" placeholder="Or paste HLD content here..."></textarea>
      </div>
    </div>
    <div class="status">Validation: <b id="validationText">Need at least one success sample + AID + HLD</b></div>
  </div>

  <div class="actions">
    <div class="subtle">Click an attached file chip to preview JSON/content before run.</div>
    <div class="actionsRight">
      <button class="btnSecondary" id="cancelBtn">Cancel</button>
      <button class="btnSecondary" id="fakeBtn">Fake Run</button>
      <button class="btnPrimary" id="startBtn">Start</button>
    </div>
  </div>
</div>

<div class="modalBack" id="previewBack">
  <div class="modal">
    <div class="modalHead">
      <span id="previewTitle">Sample Preview</span>
    </div>
    <div class="modalBody">
      <pre id="previewContent"></pre>
    </div>
  </div>
</div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  let idCounter = 0;

  const state = {
    multiUpload: true,
    successUploads: [],
    failureUploads: []
  };

  function makeId() {
    idCounter += 1;
    return 'row_' + idCounter;
  }

  function normalizePreview(content) {
    const raw = String(content || '');
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }

  function openPreview(title, content) {
    document.getElementById('previewTitle').textContent = title || 'Preview';
    document.getElementById('previewContent').textContent = normalizePreview(content);
    document.getElementById('previewBack').classList.add('show');
  }

  function closePreview() {
    document.getElementById('previewBack').classList.remove('show');
  }

  function createChip(doc, onRemove) {
    const wrap = document.createElement('div');
    wrap.style.display = 'inline-flex';
    wrap.style.gap = '5px';
    wrap.style.alignItems = 'center';

    const view = document.createElement('button');
    view.className = 'chip';
    view.textContent = doc.fileName || doc.title || 'sample';
    view.title = 'Click to preview';
    view.addEventListener('click', () => openPreview(doc.fileName || doc.title || 'sample', doc.content));

    const del = document.createElement('button');
    del.className = 'chip';
    del.textContent = 'x';
    del.title = 'Remove';
    del.addEventListener('click', () => onRemove(doc.id));

    wrap.appendChild(view);
    wrap.appendChild(del);
    return wrap;
  }

  function renderUploadChips(kind) {
    const isSuccess = kind === 'SUCCESS_SAMPLE';
    const docs = isSuccess ? state.successUploads : state.failureUploads;
    const chips = document.getElementById(isSuccess ? 'successChips' : 'failureChips');
    chips.innerHTML = '';

    docs.forEach((doc) => {
      chips.appendChild(createChip(doc, (id) => {
        if (isSuccess) {
          state.successUploads = state.successUploads.filter((d) => d.id !== id);
        } else {
          state.failureUploads = state.failureUploads.filter((d) => d.id !== id);
        }
        renderUploadChips(kind);
        refreshMetrics();
      }));
    });
  }

  async function addFiles(kind, fileList) {
    const files = Array.from(fileList || []);
    for (const f of files) {
      const text = await f.text();
      const doc = {
        id: makeId(),
        type: kind,
        title: f.name,
        content: text,
        fileName: f.name
      };
      if (kind === 'SUCCESS_SAMPLE') {
        state.successUploads.push(doc);
      } else {
        state.failureUploads.push(doc);
      }
    }
    renderUploadChips(kind);
    refreshMetrics();
  }

  function bindDropzone(dropzoneId, inputId, kind) {
    const zone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      await addFiles(kind, input.files);
      input.value = '';
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
      await addFiles(kind, e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : []);
    });
  }

  function createSampleRow(typeLabel) {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('data-row-id', makeId());
    row.innerHTML =
      '<div class="rowTop">' +
      '  <div class="field"><label>Title</label><input data-k="title" placeholder="' + typeLabel + ' title" /></div>' +
      '  <div><button class="btnDanger" data-action="remove">Remove</button></div>' +
      '</div>' +
      '<div class="field" style="margin-top:8px"><label>File Upload</label><input data-k="file" type="file" /></div>' +
      '<div class="rowMeta" data-k="fileMeta">No file selected.</div>' +
      '<div class="field" style="margin-top:8px"><label>Content</label><textarea data-k="content" placeholder="Paste ' + typeLabel + ' payload..."></textarea></div>';

    const removeBtn = row.querySelector('[data-action="remove"]');
    const fileInput = row.querySelector('input[data-k="file"]');
    const titleInput = row.querySelector('input[data-k="title"]');
    const content = row.querySelector('textarea[data-k="content"]');
    const fileMeta = row.querySelector('[data-k="fileMeta"]');

    removeBtn.addEventListener('click', () => {
      row.remove();
      refreshMetrics();
    });

    titleInput.addEventListener('input', refreshMetrics);
    content.addEventListener('input', refreshMetrics);

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) {
        fileMeta.textContent = 'No file selected.';
        refreshMetrics();
        return;
      }
      fileMeta.textContent = 'Reading ' + f.name + '...';
      const text = await f.text();
      content.value = text;
      fileMeta.textContent = 'Loaded: ' + f.name + ' (' + f.size + ' bytes)';
      row.setAttribute('data-file-name', f.name);
      refreshMetrics();
    });

    return row;
  }

  function collectSampleRows(containerId, type) {
    const container = document.getElementById(containerId);
    const out = [];
    container.querySelectorAll('.row[data-row-id]').forEach((rowEl) => {
      const titleEl = rowEl.querySelector('input[data-k="title"]');
      const contentEl = rowEl.querySelector('textarea[data-k="content"]');
      const title = titleEl.value.trim();
      const content = contentEl.value;
      const fileName = rowEl.getAttribute('data-file-name') || '';
      if (!content.trim()) return;
      out.push({
        id: rowEl.getAttribute('data-row-id'),
        type,
        title: title || fileName || 'untitled',
        content,
        fileName
      });
    });
    return out;
  }

  async function bindSingleFile(inputId, dropzoneId, metaId, textareaId, type) {
    const input = document.getElementById(inputId);
    const dropzone = document.getElementById(dropzoneId);
    const meta = document.getElementById(metaId);
    const area = document.getElementById(textareaId);

    async function loadFirstFile(fileList) {
      const f = fileList && fileList[0];
      if (!f) {
        meta.textContent = 'No ' + type + ' file selected.';
        refreshMetrics();
        return;
      }
      meta.textContent = 'Reading ' + f.name + '...';
      const text = await f.text();
      area.value = text;
      area.setAttribute('data-file-name', f.name);
      meta.textContent = 'Loaded: ' + f.name + ' (' + f.size + ' bytes)';
      refreshMetrics();
    }

    input.addEventListener('change', async () => loadFirstFile(input.files));

    dropzone.addEventListener('click', () => input.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      await loadFirstFile(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : []);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 1) {
        meta.textContent = 'Loaded first file only (single file mode).';
      }
    });

    area.addEventListener('input', refreshMetrics);
  }

  function applyModeUi() {
    const multi = state.multiUpload;
    document.getElementById('successMultiWrap').classList.toggle('hidden', !multi);
    document.getElementById('failureMultiWrap').classList.toggle('hidden', !multi);
    document.getElementById('successRowsWrap').classList.toggle('hidden', multi);
    document.getElementById('failureRowsWrap').classList.toggle('hidden', multi);
    document.getElementById('additionalInfoCard').classList.toggle('hidden', multi);
    refreshMetrics();
  }

  function refreshMetrics() {
    const successCount = state.multiUpload
      ? state.successUploads.length
      : document.querySelectorAll('#successRows .row[data-row-id]').length;
    const failureCount = state.multiUpload
      ? state.failureUploads.length
      : document.querySelectorAll('#failureRows .row[data-row-id]').length;

    const aid = document.getElementById('aidContent').value.trim();
    const hld = document.getElementById('hldContent').value.trim();
    const docs = (aid ? 1 : 0) + (hld ? 1 : 0);
    const ready = successCount > 0 && docs === 2;

    document.getElementById('metricSuccess').textContent = String(successCount);
    document.getElementById('metricFailure').textContent = String(failureCount);
    document.getElementById('metricDocs').textContent = docs + '/2';
    document.getElementById('metricReady').textContent = ready ? 'Ready' : 'Draft';
    document.getElementById('validationText').textContent = ready
      ? 'Ready to start flow execution'
      : 'Need at least one success sample + AID + HLD';
  }

  bindDropzone('successDropzone', 'successMultiFile', 'SUCCESS_SAMPLE');
  bindDropzone('failureDropzone', 'failureMultiFile', 'FAILURE_SAMPLE');

  document.getElementById('addSuccessBtn').addEventListener('click', () => {
    document.getElementById('successRows').appendChild(createSampleRow('success sample'));
    refreshMetrics();
  });
  document.getElementById('addFailureBtn').addEventListener('click', () => {
    document.getElementById('failureRows').appendChild(createSampleRow('failure sample'));
    refreshMetrics();
  });

  bindSingleFile('aidFile', 'aidDropzone', 'aidMeta', 'aidContent', 'AID');
  bindSingleFile('hldFile', 'hldDropzone', 'hldMeta', 'hldContent', 'HLD');

  document.getElementById('multiToggle').addEventListener('change', (e) => {
    state.multiUpload = !!e.target.checked;
    applyModeUi();
  });

  document.getElementById('previewBack').addEventListener('click', (e) => {
    if (e.target.id === 'previewBack') closePreview();
  });

  document.getElementById('cancelBtn').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  document.getElementById('fakeBtn').addEventListener('click', () => vscode.postMessage({ type: 'fake' }));

  document.getElementById('startBtn').addEventListener('click', () => {
    const runName = document.getElementById('runName').value.trim() || 'flowtest-run';
    const outputPath = String(document.getElementById('outputPath').value || '').trim();

    const successSamples = state.multiUpload
      ? state.successUploads.slice()
      : collectSampleRows('successRows', 'SUCCESS_SAMPLE');

    const failureSamples = state.multiUpload
      ? state.failureUploads.slice()
      : collectSampleRows('failureRows', 'FAILURE_SAMPLE');

    const aidContent = document.getElementById('aidContent').value;
    const hldContent = document.getElementById('hldContent').value;
    const aidFileName = document.getElementById('aidContent').getAttribute('data-file-name') || '';
    const hldFileName = document.getElementById('hldContent').getAttribute('data-file-name') || '';

    const aid = aidContent.trim()
      ? { id: 'aid_1', type: 'AID', title: aidFileName || 'aid', content: aidContent, fileName: aidFileName }
      : null;

    const hld = hldContent.trim()
      ? { id: 'hld_1', type: 'HLD', title: hldFileName || 'hld', content: hldContent, fileName: hldFileName }
      : null;

    const additionalInfo = String(document.getElementById('additionalInfo').value || '').trim();

    if (!aid || !hld || successSamples.length === 0) {
      alert('Please provide AID, HLD, and at least one success sample.');
      return;
    }

    vscode.postMessage({
      type: 'submit',
      payload: {
        runName,
        outputPath,
        successSamples,
        failureSamples,
        aid,
        hld,
        additionalInfo,
        multiUpload: state.multiUpload
      }
    });
  });

  document.getElementById('successRows').appendChild(createSampleRow('success sample'));
  document.getElementById('failureRows').appendChild(createSampleRow('failure sample'));
  applyModeUi();
</script>
</body>
</html>`;
}
