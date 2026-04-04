export type ScenarioSubmitPayload = {
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

export type MocksSubmitPayload = {
  dependencyName: string;
  endpoint: string;
  method: string;
  successCode: string;
  includeTimeout: boolean;
  includeRetryableFailure: boolean;
  includePartialFailure: boolean;
  notes: string;
};

export type VisionSubmitPayload = {
  screenshotName: string;
  expectedScreen: string;
  checkSuccessMessage: boolean;
  checkReferenceId: boolean;
  checkNoErrorBanner: boolean;
  extraChecks: string;
};

export function buildScenarioNormalizedRequest(p: ScenarioSubmitPayload): string {
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
      .map((x) => x.trim())
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

export function buildMocksNormalizedRequest(p: MocksSubmitPayload): string {
  const scenarios = ["success"];
  if (p.includeTimeout) scenarios.push("timeout");
  if (p.includeRetryableFailure) scenarios.push("retryable-failure");
  if (p.includePartialFailure) scenarios.push("partial-failure");

  return [
    "Target: FlowTest WireMock planning request.",
    `Dependency: ${String(p.dependencyName || "").trim()}`,
    `Endpoint: ${String(p.method || "GET").toUpperCase()} ${String(p.endpoint || "").trim()}`,
    `Success status code: ${String(p.successCode || "200").trim()}`,
    `Scenarios required: ${scenarios.join(", ")}`,
    "",
    "Generate mock definitions with:",
    "- request matcher",
    "- response payload template",
    "- scenario state transitions for each failure mode",
    "- verification hints",
    "",
    `Notes: ${String(p.notes || "").trim() || "none"}`
  ].join("\n");
}

export function buildVisionNormalizedRequest(p: VisionSubmitPayload): string {
  const checks: string[] = [];
  if (p.checkSuccessMessage) checks.push("success message visible");
  if (p.checkReferenceId) checks.push("reference/order/request id visible");
  if (p.checkNoErrorBanner) checks.push("no error banner visible");

  const extras = String(p.extraChecks || "")
    .split("\n")
    .map((x) => x.trim())
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

