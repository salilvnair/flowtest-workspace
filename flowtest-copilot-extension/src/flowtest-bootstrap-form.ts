import * as vscode from "vscode";

export type FlowtestFormId =
  | "open_scenario_form"
  | "open_mocks_form"
  | "open_vision_form";

type OpenMessage = { type: "open"; formId: FlowtestFormId };
type CancelMessage = { type: "cancel" };

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function openFormsBootstrapForm(opts: {
  extensionUri: vscode.Uri;
  title?: string;
}): Promise<FlowtestFormId | null> {
  const panel = vscode.window.createWebviewPanel(
    "flowtestFormsBootstrap",
    opts.title ?? "FlowTest: Available forms",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false }
  );
  panel.iconPath = vscode.Uri.joinPath(opts.extensionUri, "images", "flowtest_bot.svg");
  const n = nonce();
  panel.webview.html = getHtml(n);

  return await new Promise<FlowtestFormId | null>(resolve => {
    const disposables: vscode.Disposable[] = [];
    let settled = false;

    const safeResolve = (v: FlowtestFormId | null) => {
      if (settled) return;
      settled = true;
      for (const d of disposables) d.dispose();
      resolve(v);
    };

    disposables.push(panel.onDidDispose(() => safeResolve(null)));
    disposables.push(
      panel.webview.onDidReceiveMessage((msg: OpenMessage | CancelMessage) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "cancel") {
          safeResolve(null);
          panel.dispose();
          return;
        }
        if (msg.type === "open") {
          safeResolve(msg.formId);
          panel.dispose();
        }
      })
    );
  });
}

function getHtml(n: string): string {
  const forms: Array<{ id: FlowtestFormId; title: string; kind: string; desc: string }> = [
    {
      id: "open_scenario_form",
      title: "Scenario Builder",
      kind: "FLOW",
      desc: "Capture business flow, entry point, dependencies, and validation targets."
    },
    {
      id: "open_mocks_form",
      title: "Mocks Planner",
      kind: "MOCK",
      desc: "Define downstream mock behavior (success, timeout, retry, partial failure)."
    },
    {
      id: "open_vision_form",
      title: "Vision Assertions",
      kind: "VISION",
      desc: "Describe screenshot checkpoints and semantic UI checks for final truth validation."
    }
  ];

  const rowsHtml = forms
    .map(
      (f, idx) => `
<tr class="row" data-open="${escapeHtml(f.id)}" role="button" tabindex="0">
  <td class="num">${idx + 1}</td>
  <td class="main">
    <div class="titleRow">
      <span class="badge">${escapeHtml(f.kind)}</span>
      <span class="formTitle">${escapeHtml(f.title)}</span>
    </div>
    <div class="formDesc">${escapeHtml(f.desc)}</div>
    <div class="meta"><span class="codePill">${escapeHtml(f.id)}</span></div>
  </td>
  <td class="actions"><button class="primary" type="button" data-open="${escapeHtml(f.id)}">Open</button></td>
</tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FlowTest Forms</title>
  <style nonce="${n}">
    :root {
      --dmcr-bg: var(--vscode-editor-background);
      --dmcr-fg: var(--vscode-editor-foreground, var(--vscode-foreground));
      --dmcr-muted: var(--vscode-descriptionForeground, rgba(127,127,127,0.85));
      --dmcr-border: var(--vscode-panel-border, rgba(127,127,127,0.35));
      --dmcr-card-bg: var(--vscode-editorWidget-background, rgba(127,127,127,0.04));
      --dmcr-hover: var(--vscode-list-hoverBackground, rgba(127,127,127,0.08));
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px 14px; font-family: var(--vscode-font-family); color: var(--dmcr-fg); background: var(--dmcr-bg); font-size: 13px; line-height: 1.35; }
    .wrap { max-width: 980px; padding-top: 20px; padding-bottom: 20px; margin: auto; padding-left: 14px; padding-right: 14px; }
    .h { font-weight: 800; font-size: 16px; margin-top: 2px; }
    .hint { margin-top: 4px; color: var(--dmcr-muted); font-size: 12px; }
    .card { border: 1px solid var(--dmcr-border); background: var(--dmcr-card-bg); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 28px rgba(0,0,0,0.18); margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; font-weight: 800; padding: 10px 12px; background: rgba(127,127,127,0.06); border-bottom: 1px solid var(--dmcr-border); font-size: 12px; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid rgba(127,127,127,0.18); vertical-align: top; }
    tbody tr:last-child td { border-bottom: none; }
    tr.row:hover td { background: var(--dmcr-hover); }
    td.num { width: 48px; color: var(--dmcr-muted); }
    td.actions { width: 132px; text-align: right; white-space: nowrap; }
    .titleRow { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .formTitle { font-weight: 800; }
    .formDesc { color: var(--dmcr-muted); }
    .meta { margin-top: 8px; }
    .codePill { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.25); background: rgba(127,127,127,0.06); font-size: 11px; }
    .badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 65%, rgba(127,127,127,0.35)); background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 18%, transparent); color: var(--vscode-charts-blue, #3794ff); font-size: 11px; font-weight: 800; }
    button { display: inline-flex; align-items: center; justify-content: center; padding: 7px 12px; min-height: 32px; border-radius: 8px; border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; white-space: nowrap; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    .footer { position: sticky; bottom: 0; margin-top: 12px; padding-top: 12px; display: flex; justify-content: flex-end; background: linear-gradient(to bottom, transparent, var(--dmcr-bg) 40%); }
    button.secondary { background: transparent; color: var(--dmcr-fg); border-color: var(--dmcr-border); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="h">FlowTest Forms</div>
    <div class="hint">Pick a form to create a normalized FlowTest generation request.</div>
    <div class="card">
      <table>
        <thead><tr><th style="width:48px">#</th><th>Form</th><th style="width:132px">Action</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="footer"><button class="secondary" id="cancelBtn" type="button">Cancel</button></div>
  </div>
  <script nonce="${n}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-open]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-open');
        if (id) vscode.postMessage({ type: 'open', formId: id });
      });
    });
    document.getElementById('cancelBtn').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  </script>
</body>
</html>`;
}
