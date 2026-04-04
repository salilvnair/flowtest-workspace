import * as vscode from "vscode";

type SubmitMessage = {
  type: "submit";
  payload: {
    screenshotName: string;
    expectedScreen: string;
    checkSuccessMessage: boolean;
    checkReferenceId: boolean;
    checkNoErrorBanner: boolean;
    extraChecks: string;
  };
};

type CancelMessage = { type: "cancel" };

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildNormalizedRequest(p: SubmitMessage["payload"]): string {
  const checks: string[] = [];
  if (p.checkSuccessMessage) checks.push("success message visible");
  if (p.checkReferenceId) checks.push("reference/order/request id visible");
  if (p.checkNoErrorBanner) checks.push("no error banner visible");

  const extras = String(p.extraChecks || "")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  return [
    "Target: FlowTest vision assertion planning request.",
    `Screenshot artifact: ${String(p.screenshotName || "").trim() || "step-confirmation.png"}`,
    `Expected screen intent: ${String(p.expectedScreen || "").trim()}`,
    `Base checks: ${checks.concat(extras).join(", ") || "none"}`,
    "",
    "Generate vision-assert DSL blocks with:",
    "- capture-screenshot step(s)",
    "- checks array for semantic validation",
    "- pass/fail-ready assertions for deterministic engine use"
  ].join("\n");
}

export async function openVisionForm(opts: {
  extensionUri: vscode.Uri;
  title?: string;
}): Promise<string | null> {
  const panel = vscode.window.createWebviewPanel(
    "flowtestVisionForm",
    opts.title ?? "FlowTest Vision Assertions",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false }
  );
  panel.iconPath = vscode.Uri.joinPath(opts.extensionUri, "images", "flowtest_bot.svg");
  const n = nonce();
  panel.webview.html = getHtml(n);

  return await new Promise<string | null>(resolve => {
    const d1 = panel.onDidDispose(() => resolve(null));
    const d2 = panel.webview.onDidReceiveMessage((msg: SubmitMessage | CancelMessage) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "cancel") {
        d1.dispose();
        d2.dispose();
        resolve(null);
        panel.dispose();
        return;
      }
      if (msg.type === "submit") {
        d1.dispose();
        d2.dispose();
        resolve(buildNormalizedRequest(msg.payload));
        panel.dispose();
      }
    });
  });
}

function getHtml(n: string): string {
  return `<!doctype html><html lang="en"><head>
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
      --warn: var(--vscode-charts-yellow, #e2c08d);
      --info: var(--vscode-charts-blue, #3794ff);
      --shadow: 0 10px 24px rgba(0,0,0,0.18);
    }
    * { box-sizing: border-box; }
    @keyframes ftFadeInUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes ftShine {
      0% { transform: translateX(-120%); opacity: 0; }
      30% { opacity: 0.42; }
      100% { transform: translateX(140%); opacity: 0; }
    }
    @keyframes ftPulseGlow {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--focus) 0%, transparent); }
      50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 28%, transparent); }
    }
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
    .wrap { max-width: 980px; margin: 0 auto; padding-bottom: 70px; }
    .hero, .card { animation: ftFadeInUp 260ms ease both; }
    .card { animation-delay: 30ms; }
    .hero {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(160deg, color-mix(in srgb, var(--card) 90%, transparent), color-mix(in srgb, var(--bg) 92%, transparent));
      padding: 10px 12px;
      box-shadow: var(--shadow);
      margin-bottom: 10px;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(104deg, transparent 22%, color-mix(in srgb, var(--info) 26%, transparent) 46%, transparent 73%);
      transform: translateX(-130%);
      animation: ftShine 7s ease-in-out infinite;
      pointer-events: none;
    }
    .heroHead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .hero h1 { margin: 0; font-size: 15px; font-weight: 900; letter-spacing: 0.2px; display: inline-flex; align-items: center; gap: 8px; }
    .hero h1 svg { width: 16px; height: 16px; stroke: #9fd1ff; fill: none; stroke-width: 2; }
    .hint { color: var(--muted); margin-top: 4px; }
    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 800;
      color: #b9dcff;
      background: linear-gradient(140deg, color-mix(in srgb, var(--info) 28%, transparent), color-mix(in srgb, var(--card) 84%, transparent));
      white-space: nowrap;
    }
    .card {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(160deg, color-mix(in srgb, var(--card) 88%, transparent), color-mix(in srgb, var(--bg) 95%, transparent));
      padding: 10px;
      margin-top: 9px;
      box-shadow: var(--shadow);
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    }
    .card:hover {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--focus) 40%, var(--border));
      box-shadow: 0 12px 28px rgba(0,0,0,0.24);
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, color-mix(in srgb, white 9%, transparent), transparent 38%);
      pointer-events: none;
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
      min-width: 56px;
      text-align: center;
      font-size: 9px;
      font-weight: 900;
      padding: 2px 8px;
    }
    .badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
    .badge.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 13%, transparent); }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field > label { font-size: 11px; color: color-mix(in srgb, var(--fg) 78%, var(--muted)); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
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
    .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .check {
      position: relative;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px;
      background: color-mix(in srgb, var(--card) 80%, transparent);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
    }
    .check:hover {
      border-color: color-mix(in srgb, var(--focus) 45%, var(--border));
      background: color-mix(in srgb, var(--hover) 68%, var(--card));
    }
    .check input { position: absolute; opacity: 0; pointer-events: none; }
    .checkMark {
      width: 18px; height: 18px; border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
      border-radius: 5px; background: color-mix(in srgb, var(--bg) 82%, transparent);
      display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
      transition: all 140ms ease;
    }
    .checkMark svg {
      width: 12px; height: 12px; stroke: white; fill: none; stroke-width: 2.4;
      stroke-linecap: round; stroke-linejoin: round; opacity: 0; transform: scale(0.5);
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .check input:checked + .checkMark {
      background: color-mix(in srgb, var(--info) 84%, #2f82ff);
      border-color: color-mix(in srgb, var(--info) 72%, var(--border));
      animation: ftPulseGlow 1.4s ease-out 1;
    }
    .check input:checked + .checkMark svg { opacity: 1; transform: scale(1); }
    .actions {
      position: fixed;
      right: 16px;
      bottom: 14px;
      display: flex;
      gap: 8px;
      z-index: 4;
    }
    button {
      position: relative;
      overflow: hidden;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      min-height: 32px;
      border-radius: 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-size: 12px;
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
    }
    button:hover { transform: translateY(-1px); }
    button svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    button.primary {
      background: linear-gradient(145deg, color-mix(in srgb, var(--vscode-button-background) 86%, white 14%), var(--vscode-button-background));
      color: var(--vscode-button-foreground);
      box-shadow: 0 8px 18px color-mix(in srgb, var(--vscode-button-background) 35%, transparent);
    }
    button.primary::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(102deg, transparent 20%, rgba(255,255,255,0.26) 50%, transparent 80%);
      transform: translateX(-130%);
      transition: transform 350ms ease;
    }
    button.primary:hover::after { transform: translateX(120%); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: linear-gradient(145deg, color-mix(in srgb, var(--card) 84%, transparent), color-mix(in srgb, var(--bg) 94%, transparent));
      color: var(--fg);
      border-color: var(--border);
    }
    @media (max-width: 860px) {
      .grid2, .checks { grid-template-columns: 1fr; }
      .actions { position: static; margin-top: 10px; justify-content: flex-end; }
      .wrap { padding-bottom: 12px; }
    }
  </style></head>
<body><div class="wrap">
  <div class="hero">
    <div class="heroHead">
      <h1><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 13l3-3l3 3l3-4l2 3"></path></svg>FlowTest Vision Assertions</h1>
      <span class="pill">Visual Mode</span>
    </div>
    <div class="hint">Define semantic screenshot checks for deterministic vision assertions.</div>
  </div>
  <div class="card">
    <div class="title"><span class="badge ok">Core</span>Vision Context</div>
    <div class="grid2">
      <div class="field"><label>Screenshot Name</label><input id="screenshotName" value="step-confirmation.png" /></div>
      <div class="field"><label>Expected Screen Intent</label><input id="expectedScreen" value="Order confirmation screen shown after submit" /></div>
    </div>
    <div class="title" style="margin-top:10px"><span class="badge warn">Checks</span>Assertions</div>
    <div class="checks">
      <label class="check"><input id="checkSuccessMessage" type="checkbox" checked /><span class="checkMark"><svg viewBox="0 0 16 16"><path d="M3.2 8.4l3 3.2l6.6-7.1"></path></svg></span><span>Success message visible</span></label>
      <label class="check"><input id="checkReferenceId" type="checkbox" checked /><span class="checkMark"><svg viewBox="0 0 16 16"><path d="M3.2 8.4l3 3.2l6.6-7.1"></path></svg></span><span>Reference/order id visible</span></label>
      <label class="check"><input id="checkNoErrorBanner" type="checkbox" checked /><span class="checkMark"><svg viewBox="0 0 16 16"><path d="M3.2 8.4l3 3.2l6.6-7.1"></path></svg></span><span>No error banner</span></label>
    </div>
    <div class="field" style="margin-top:8px"><label>Extra Checks (one per line)</label><textarea id="extraChecks" placeholder="spinner hidden&#10;submit button disabled"></textarea></div>
  </div>
  <div class="actions">
    <button class="secondary" id="cancelBtn"><svg viewBox="0 0 24 24"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>Cancel</button>
    <button class="primary" id="generateBtn"><svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M13 5l7 7l-7 7"></path></svg>Generate FlowTest Request</button>
  </div>
</div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const byId = id => document.getElementById(id);
  byId('cancelBtn').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  byId('generateBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'submit', payload: {
      screenshotName: byId('screenshotName').value,
      expectedScreen: byId('expectedScreen').value,
      checkSuccessMessage: byId('checkSuccessMessage').checked,
      checkReferenceId: byId('checkReferenceId').checked,
      checkNoErrorBanner: byId('checkNoErrorBanner').checked,
      extraChecks: byId('extraChecks').value
    }});
  });
</script></body></html>`;
}
