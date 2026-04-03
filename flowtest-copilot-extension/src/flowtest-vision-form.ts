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
    opts.title ?? "FlowTest: Vision Assertions",
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
    :root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --muted: var(--vscode-descriptionForeground); --border: var(--vscode-panel-border, rgba(127,127,127,0.35)); --card: var(--vscode-editorWidget-background, rgba(127,127,127,0.04)); }
    * { box-sizing: border-box; } body { margin: 0; padding: 12px 14px; font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); font-size: 13px; }
    .wrap { max-width: 1060px; margin: 0 auto; } .hint { color: var(--muted); margin-bottom: 12px; } .card { border: 1px solid var(--border); border-radius: 12px; background: var(--card); padding: 12px; margin: 10px 0; box-shadow: 0 10px 26px rgba(0,0,0,0.14); }
    .section-title { font-weight: 900; font-size: 12px; letter-spacing: .35px; text-transform: uppercase; color: var(--muted); margin: 4px 0 10px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; } .field > label { font-size: 12px; opacity: .85; }
    input, textarea { width: 100%; padding: 8px 10px; min-height: 32px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 10px; min-width: 0; }
    textarea { min-height: 110px; resize: vertical; } .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .check { border: 1px solid var(--border); border-radius: 8px; padding: 8px; background: rgba(127,127,127,0.04); display: flex; align-items: center; gap: 8px; }
    .actions { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; } button { padding: 7px 12px; min-height: 32px; border-radius: 8px; border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); } button.primary:hover { background: var(--vscode-button-hoverBackground); } button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
    @media (max-width: 860px) { .row, .checks { grid-template-columns: 1fr; } }
  </style></head>
<body><div class="wrap">
  <div class="hint">Define semantic screenshot checks for FlowTest vision assertions.</div>
  <div class="card">
    <div class="section-title">Vision Context</div>
    <div class="row">
      <div class="field"><label>Screenshot Name</label><input id="screenshotName" value="step-confirmation.png" /></div>
      <div class="field"><label>Expected Screen Intent</label><input id="expectedScreen" value="Order confirmation screen shown after submit" /></div>
    </div>
    <div class="section-title" style="margin-top:12px">Checks</div>
    <div class="checks">
      <label class="check"><input id="checkSuccessMessage" type="checkbox" checked /> Success message visible</label>
      <label class="check"><input id="checkReferenceId" type="checkbox" checked /> Reference/order id visible</label>
      <label class="check"><input id="checkNoErrorBanner" type="checkbox" checked /> No error banner</label>
    </div>
    <div class="field" style="margin-top:10px"><label>Extra Checks (one per line)</label><textarea id="extraChecks" placeholder="spinner hidden&#10;submit button disabled"></textarea></div>
  </div>
  <div class="actions"><button class="secondary" id="cancelBtn">Cancel</button><button class="primary" id="generateBtn">Generate FlowTest Request</button></div>
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
