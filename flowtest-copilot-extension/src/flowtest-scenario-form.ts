import * as vscode from "vscode";

type SubmitMessage = {
  type: "submit";
  payload: {
    scenarioId: string;
    scenarioName: string;
    businessGoal: string;
    entryPoint: "ui" | "api";
    includeApi: boolean;
    includeDb: boolean;
    includeAsync: boolean;
    includeVision: boolean;
    advancedEnabled: boolean;
    dependencyName: string;
    dependencyEndpoint: string;
    dependencyMethod: string;
    dependencySuccessCode: string;
    includeTimeout: boolean;
    includeRetryableFailure: boolean;
    includePartialFailure: boolean;
    expectedScreen: string;
    checkSuccessMessage: boolean;
    checkReferenceId: boolean;
    checkNoErrorBanner: boolean;
    extraChecks: string;
    notes: string;
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
  const tags: string[] = [];
  if (p.entryPoint === "ui") tags.push("ui");
  if (p.includeApi) tags.push("api");
  if (p.includeDb) tags.push("db");
  if (p.includeAsync) tags.push("async");
  if (p.includeVision) tags.push("vision");

  const advancedLines: string[] = [];
  if (p.advancedEnabled) {
    const mockModes: string[] = ["success"];
    if (p.includeTimeout) mockModes.push("timeout");
    if (p.includeRetryableFailure) mockModes.push("retryable-failure");
    if (p.includePartialFailure) mockModes.push("partial-failure");

    const visionChecks: string[] = [];
    if (p.checkSuccessMessage) visionChecks.push("success message visible");
    if (p.checkReferenceId) visionChecks.push("reference/order/request id visible");
    if (p.checkNoErrorBanner) visionChecks.push("no error banner visible");

    const extraChecks = String(p.extraChecks || "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    advancedLines.push(
      "",
      "Advanced context:",
      `- Dependency: ${String(p.dependencyName || "").trim() || "inventory-service"}`,
      `- Endpoint: ${String(p.dependencyMethod || "GET").toUpperCase()} ${String(p.dependencyEndpoint || "").trim() || "/external/inventory/check"}`,
      `- Success status code: ${String(p.dependencySuccessCode || "200").trim()}`,
      `- Mock scenarios: ${mockModes.join(", ")}`,
      `- Expected screen intent: ${String(p.expectedScreen || "").trim() || "Order confirmation shown after submit"}`,
      `- Vision checks: ${visionChecks.concat(extraChecks).join(", ") || "none"}`
    );
  }

  return [
    "Target: FlowTest scenario generation.",
    `Scenario ID: ${String(p.scenarioId || "").trim() || "flowtest-scenario"}`,
    `Scenario name: ${String(p.scenarioName || "").trim() || "Generated FlowTest Scenario"}`,
    `Business goal: ${String(p.businessGoal || "").trim()}`,
    `Entry point: ${p.entryPoint}`,
    `Validation tags: ${tags.join(", ") || "api,db"}`,
    "",
    "Generate JSON DSL with:",
    "- dslVersion, scenarioId, name, tags, config, data, mocks, steps, cleanup",
    "- deterministic assertions",
    "- wait-until for async when includeAsync=true",
    "- vision-assert when includeVision=true",
    ...advancedLines,
    "",
    `Additional notes: ${String(p.notes || "").trim() || "none"}`
  ].join("\n");
}

export async function openScenarioForm(opts: {
  extensionUri: vscode.Uri;
  title?: string;
}): Promise<string | null> {
  const panel = vscode.window.createWebviewPanel(
    "flowtestScenarioForm",
    opts.title ?? "FlowTest Scenario Builder",
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
  return `<!doctype html>
<html lang="en"><head>
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
    .wrap { max-width: 980px; margin: 0 auto; padding-bottom: 70px; }
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
      min-width: 56px;
      text-align: center;
      font-size: 9px;
      font-weight: 900;
      padding: 2px 8px;
    }
    .badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
    .badge.info { color: var(--info); background: color-mix(in srgb, var(--info) 13%, transparent); }
    .badge.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 13%, transparent); }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field > label { font-size: 11px; color: color-mix(in srgb, var(--fg) 78%, var(--muted)); }
    input, select, textarea {
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
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--focus);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--focus) 45%, transparent);
    }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .check {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px;
      background: color-mix(in srgb, var(--card) 80%, transparent);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .check input { width: 14px; height: 14px; accent-color: var(--info); }
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
    .switch { position: relative; width: 42px; height: 24px; display: inline-block; }
    .switch input { display: none; }
    .slider {
      position: absolute; inset: 0;
      background: color-mix(in srgb, var(--muted) 28%, transparent);
      border-radius: 999px; border: 1px solid var(--border);
      transition: all 140ms ease; cursor: pointer;
    }
    .slider:before {
      content: ""; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px;
      background: white; border-radius: 50%; transition: transform 140ms ease;
    }
    .switch input:checked + .slider {
      background: color-mix(in srgb, var(--info) 38%, transparent);
      border-color: color-mix(in srgb, var(--info) 70%, var(--border));
    }
    .switch input:checked + .slider:before { transform: translateX(18px); }
    .hidden { display: none !important; }
    .actions {
      position: fixed;
      right: 16px;
      bottom: 14px;
      display: flex;
      gap: 8px;
      z-index: 4;
    }
    button {
      padding: 7px 12px;
      min-height: 32px;
      border-radius: 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-size: 12px;
    }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: transparent; color: var(--fg); border-color: var(--border); }
    @media (max-width: 860px) {
      .grid2, .checks { grid-template-columns: 1fr; }
      .actions { position: static; margin-top: 10px; justify-content: flex-end; }
      .wrap { padding-bottom: 12px; }
    }
  </style></head>
<body><div class="wrap">
  <div class="hero">
    <div class="heroHead">
      <h1>FlowTest Scenario Builder</h1>
      <span class="pill">Guided Mode</span>
    </div>
    <div class="hint">Capture flow intent in Basic mode. Turn on Advanced for dependency failure and vision planning.</div>
  </div>

  <div class="card">
    <div class="title"><span class="badge ok">Basic</span>Scenario Basics</div>
    <div class="grid2">
      <div class="field"><label>Scenario ID</label><input id="scenarioId" value="customer-onboarding-success" /></div>
      <div class="field"><label>Scenario Name</label><input id="scenarioName" value="Customer onboarding completes successfully" /></div>
    </div>
    <div class="grid2" style="margin-top:8px">
      <div class="field"><label>Entry Point</label><select id="entryPoint"><option value="ui">UI</option><option value="api">API</option></select></div>
      <div class="field"><label>Business Goal</label><input id="businessGoal" value="Validate end-to-end onboarding truth across system layers" /></div>
    </div>
    <div class="title" style="margin-top:10px"><span class="badge info">Basic</span>Validation Scope</div>
    <div class="checks">
      <label class="check"><input id="includeApi" type="checkbox" checked /> API assertions</label>
      <label class="check"><input id="includeDb" type="checkbox" checked /> DB truth checks</label>
      <label class="check"><input id="includeAsync" type="checkbox" checked /> Async/workflow wait checks</label>
      <label class="check"><input id="includeVision" type="checkbox" /> Vision assertions</label>
    </div>
    <div class="field" style="margin-top:10px"><label>Additional Notes</label><textarea id="notes" placeholder="Any constraints, contracts, edge cases..."></textarea></div>
  </div>

  <div class="toggleRow">
    <div class="toggleMeta">
      <b>Advanced Controls</b>
      <div>Enable dependency mock coverage + richer vision assertions.</div>
    </div>
    <label class="switch">
      <input id="advancedToggle" type="checkbox" />
      <span class="slider"></span>
    </label>
  </div>

  <div class="card hidden" id="advancedCard">
    <div class="title"><span class="badge warn">Advanced</span>Mock Planning</div>
    <div class="grid2">
      <div class="field"><label>Dependency Name</label><input id="dependencyName" value="inventory-service" /></div>
      <div class="field"><label>Endpoint</label><input id="dependencyEndpoint" value="/external/inventory/check" /></div>
    </div>
    <div class="grid2" style="margin-top:8px">
      <div class="field"><label>Method</label><select id="dependencyMethod"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></div>
      <div class="field"><label>Success Status</label><input id="dependencySuccessCode" value="200" /></div>
    </div>
    <div class="checks" style="margin-top:8px">
      <label class="check"><input id="includeTimeout" type="checkbox" checked /> Timeout scenario</label>
      <label class="check"><input id="includeRetryableFailure" type="checkbox" checked /> Retryable failure</label>
      <label class="check"><input id="includePartialFailure" type="checkbox" /> Partial failure</label>
    </div>

    <div class="title" style="margin-top:10px"><span class="badge warn">Advanced</span>Vision Planning</div>
    <div class="grid2">
      <div class="field" style="grid-column: 1 / -1;"><label>Expected Screen Intent</label><input id="expectedScreen" value="Order confirmation screen shown after submit" /></div>
    </div>
    <div class="checks" style="margin-top:8px">
      <label class="check"><input id="checkSuccessMessage" type="checkbox" checked /> Success message visible</label>
      <label class="check"><input id="checkReferenceId" type="checkbox" checked /> Reference/order id visible</label>
      <label class="check"><input id="checkNoErrorBanner" type="checkbox" checked /> No error banner visible</label>
    </div>
    <div class="field" style="margin-top:8px"><label>Extra Checks (one per line)</label><textarea id="extraChecks" placeholder="spinner hidden&#10;submit button disabled"></textarea></div>
  </div>

  <div class="actions"><button class="secondary" id="cancelBtn">Cancel</button><button class="primary" id="generateBtn">Generate FlowTest Request</button></div>
</div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const byId = id => document.getElementById(id);
  const advancedToggle = byId('advancedToggle');
  const advancedCard = byId('advancedCard');
  const syncAdvanced = () => {
    advancedCard.classList.toggle('hidden', !advancedToggle.checked);
  };
  advancedToggle.addEventListener('change', syncAdvanced);
  syncAdvanced();
  byId('cancelBtn').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  byId('generateBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'submit', payload: {
      scenarioId: byId('scenarioId').value,
      scenarioName: byId('scenarioName').value,
      businessGoal: byId('businessGoal').value,
      entryPoint: byId('entryPoint').value,
      includeApi: byId('includeApi').checked,
      includeDb: byId('includeDb').checked,
      includeAsync: byId('includeAsync').checked,
      includeVision: byId('includeVision').checked,
      advancedEnabled: advancedToggle.checked,
      dependencyName: byId('dependencyName').value,
      dependencyEndpoint: byId('dependencyEndpoint').value,
      dependencyMethod: byId('dependencyMethod').value,
      dependencySuccessCode: byId('dependencySuccessCode').value,
      includeTimeout: byId('includeTimeout').checked,
      includeRetryableFailure: byId('includeRetryableFailure').checked,
      includePartialFailure: byId('includePartialFailure').checked,
      expectedScreen: byId('expectedScreen').value,
      checkSuccessMessage: byId('checkSuccessMessage').checked,
      checkReferenceId: byId('checkReferenceId').checked,
      checkNoErrorBanner: byId('checkNoErrorBanner').checked,
      extraChecks: byId('extraChecks').value,
      notes: byId('notes').value
    }});
  });
</script></body></html>`;
}
