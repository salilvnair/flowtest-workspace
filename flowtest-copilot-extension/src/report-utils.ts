import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as fs from "fs";
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

  const open = await runCommand("allure", ["open", reportDir], root);
  if (open.code !== 0) {
    return {
      ok: false,
      message: "Allure report generated but failed to open via local server.",
      reportPath: reportIndex,
      logs: [gen.stdout, open.stdout, open.stderr].filter(Boolean).join("\n")
    };
  }
  const urlMatch = `${open.stdout}\n${open.stderr}`.match(/https?:\/\/[^\s]+/);
  const reportUrl = urlMatch?.[0];
  if (reportUrl) {
    await vscode.env.openExternal(vscode.Uri.parse(reportUrl));
  }
  return {
    ok: true,
    message: reportUrl
      ? `Allure report opened: ${reportUrl}`
      : `Allure report opened via local server for: ${reportDir}`,
    reportPath: reportIndex,
    reportUrl,
    logs: [gen.stdout, open.stdout, open.stderr].filter(Boolean).join("\n")
  };
}
