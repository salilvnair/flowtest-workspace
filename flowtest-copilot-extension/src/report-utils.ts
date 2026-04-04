import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

let preferredAllureResultsDir: string | null = null;
let preferredAllureReportDir: string | null = null;

export function setPreferredAllurePaths(input: { resultsDir?: string; reportDir?: string }): void {
  preferredAllureResultsDir = input.resultsDir?.trim() || null;
  preferredAllureReportDir = input.reportDir?.trim() || null;
}

function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? process.cwd();
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = childProcess.spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    proc.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    proc.on("error", (e) => resolve({ code: 1, stdout, stderr: e.message }));
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function stopExistingAllureServe(root: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  // best-effort: stop previously detached "allure open"/"allure serve" processes
  await runCommand("pkill", ["-f", "allure open"], root);
  await runCommand("pkill", ["-f", "allure serve"], root);
}

export async function prepareAllureForFreshRun(): Promise<{ ok: boolean; message: string; cleanedResultsDir?: string }> {
  const root = workspaceRoot();
  await stopExistingAllureServe(root);

  const candidateResults = [
    preferredAllureResultsDir,
    path.join(root, "allure-results"),
    path.join(root, "flowtest-parent", "allure-results")
  ].filter(Boolean) as string[];
  const resultsDir = candidateResults.find((p) => fs.existsSync(p));
  if (!resultsDir) {
    return { ok: true, message: "No existing allure-results directory found to clean." };
  }

  try {
    const entries = await fsp.readdir(resultsDir, { withFileTypes: true });
    await Promise.all(entries.map((entry) => {
      const full = path.join(resultsDir, entry.name);
      return fsp.rm(full, { recursive: true, force: true });
    }));
    return { ok: true, message: `Cleaned allure-results: ${resultsDir}`, cleanedResultsDir: resultsDir };
  } catch (error: any) {
    return {
      ok: false,
      message: `Failed to clean allure-results: ${error?.message ?? String(error)}`,
      cleanedResultsDir: resultsDir
    };
  }
}

export async function generateAndOpenAllureReport(): Promise<{
  ok: boolean;
  message: string;
  reportPath?: string;
  reportUrl?: string;
  logs?: string;
}> {
  const root = workspaceRoot();
  const candidateResults = [
    preferredAllureResultsDir,
    path.join(root, "allure-results"),
    path.join(root, "flowtest-parent", "allure-results")
  ].filter(Boolean) as string[];
  const resultsDir = candidateResults.find((p) => fs.existsSync(p));
  if (!resultsDir) {
    return {
      ok: false,
      message: `Allure results not found. Checked: ${candidateResults.join(", ")}`
    };
  }

  const reportDir = preferredAllureReportDir?.trim()
    ? preferredAllureReportDir.trim()
    : path.join(path.dirname(resultsDir), "allure-report");
  const reportIndex = path.join(reportDir, "index.html");
  await stopExistingAllureServe(root);
  const gen = await runCommand("allure", ["generate", resultsDir, "-o", reportDir, "--clean"], root);
  if (gen.code !== 0) {
    return {
      ok: false,
      message: "Failed to generate Allure report. Ensure Allure CLI is installed and available in PATH.",
      logs: [gen.stdout, gen.stderr].filter(Boolean).join("\n")
    };
  }

  if (!fs.existsSync(reportIndex)) {
    return {
      ok: false,
      message: `Allure report generated but index not found: ${reportIndex}`,
      logs: gen.stdout
    };
  }

  /* Spawn `allure open` detached so it starts an HTTP server without blocking */
  const openProc = childProcess.spawn("allure", ["open", reportDir], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    shell: false
  });
  openProc.unref();

  return {
    ok: true,
    message: `Allure report served: ${reportDir}`,
    reportPath: reportIndex,
    logs: gen.stdout
  };
}
