export type FakeAction = {
  label: string;
  title: string;
  content: string;
};

export type FakeEvent = {
  time: string;
  stage: string;
  status: "running" | "success" | "warn" | "error" | "info";
  title: string;
  detail?: string;
  meta?: Record<string, string | number | boolean>;
  actions?: FakeAction[];
};

export type FakeRunFixture = {
  runName: string;
  orchestrationPrefix: string;
  temporalLink: string;
  successCount: number;
  failureCount: number;
  intakeMode: string;
  summaryStart: string;
  summaryEnd: string;
  intervalMs: number;
  events: FakeEvent[];
};

export function createFakeRunFixture(): FakeRunFixture {
  const fakeApiRequest = {
    taskType: "GENERATE_API_SPEC",
    provider: "copilot",
    model: "copilot-selected-model",
    context: {
      runName: "flowtest-fake-run",
      orchestrationId: "fake-023c6646-1811-4d0c-aa17-9c118a87c2d7",
      docTypes: ["success", "failure", "aid", "hld"]
    },
    request: {
      requirements: {
        validations: ["api", "db", "async", "vision"],
        responseFormats: ["json", "xml"],
        strictMode: true
      },
      samples: {
        successCount: 3,
        failureCount: 2
      }
    }
  };
  const fakeApiResponse = {
    openapi: "3.0.3",
    info: {
      title: "FlowTest Fake Service",
      version: "1.0.0"
    },
    paths: {
      "/v1/eligibility/check": {
        post: {
          summary: "Eligibility check",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["customerId", "serviceType"],
                  properties: {
                    customerId: { type: "string" },
                    serviceType: { type: "string" },
                    metadata: { type: "object" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Eligible" },
            "400": { description: "Invalid request" },
            "503": { description: "Dependency timeout" }
          }
        }
      }
    }
  };
  const fakeDsl = {
    dslVersion: "1.0",
    scenarioId: "fake-electricity-disconnect",
    name: "Fake end to end validation",
    tags: ["ui", "api", "db", "async", "vision"],
    config: {
      timeoutMs: 120000,
      retry: { maxAttempts: 2, backoffMs: 1500 }
    },
    steps: [
      { type: "ui-open", page: "/start" },
      { type: "ui-fill", field: "customerId", value: "CUST-1001" },
      { type: "api-assert", endpoint: "/v1/eligibility/check", expectedStatus: 200 },
      { type: "db-assert", query: "select status from orders where customer_id='CUST-1001'", expected: "PENDING" },
      { type: "vision-assert", screenshot: "confirmation.png", checks: ["success message", "no error banner"] }
    ]
  };
  const fakeEngineResult = {
    success: true,
    executedSteps: 5,
    durationMs: 28439,
    assertions: {
      passed: 12,
      failed: 0
    },
    artifacts: [
      "api-spec.md",
      "wiremock-mappings.json",
      "scenario.dsl.json",
      "engine-run-result.json"
    ]
  };

  return {
    runName: "flowtest-fake-run",
    orchestrationPrefix: "fake-",
    temporalLink: "http://localhost:8233/namespaces/default/workflows/fake-demo",
    successCount: 3,
    failureCount: 2,
    intakeMode: "multi upload",
    summaryStart: "Fake regression sequence",
    summaryEnd: "Fake regression sequence finished",
    intervalMs: 350,
    events: [
      {
        time: "10:00:01",
        stage: "UI",
        status: "success",
        title: "Status Panel Initialized",
        detail: "Fake run bootstrapped for UI regression.",
        meta: { editor: "VS Code", extension: "flowtest-copilot", version: "0.0.1" }
      },
      { time: "10:00:02", stage: "Intake", status: "success", title: "Received", detail: "5 docs captured.", meta: { docs: 5, mode: "multi_upload", format: "json" } },
      {
        time: "10:00:05",
        stage: "API Spec",
        status: "running",
        title: "Ai Request Dispatched",
        detail: "task=GENERATE_API_SPEC",
        meta: { task: "GENERATE_API_SPEC", provider: "copilot", model: "copilot-selected-model", temperature: "default" },
        actions: [{
          label: "AI Request",
          title: "Fake API Spec Request",
          content: JSON.stringify(fakeApiRequest)
        }]
      },
      {
        time: "10:00:08",
        stage: "API Spec",
        status: "success",
        title: "Ai Response Received",
        detail: "17239 chars",
        meta: { task: "GENERATE_API_SPEC", provider: "copilot", model: "copilot-selected-model", response_chars: 17239, duration_ms: 3200 },
        actions: [{
          label: "AI Response",
          title: "Fake API Spec Response",
          content: JSON.stringify(fakeApiResponse)
        }]
      },
      {
        time: "10:00:12",
        stage: "WireMock",
        status: "success",
        title: "Completed",
        detail: "Mappings generated.",
        meta: { path: "/v1/eligibility/check", method: "POST", base_url: "http://localhost:8080", mappings: 1 },
        actions: [{ label: "Generated Mocks", title: "Fake WireMock Mappings", content: "[{ \"request\": { \"method\": \"POST\" }, \"response\": { \"status\": 200 } }]" }]
      },
      {
        time: "10:00:16",
        stage: "Scenario DSL",
        status: "success",
        title: "Completed",
        detail: "Scenario generated and validated.",
        meta: { task: "GENERATE_SCENARIO_DSL", provider: "copilot", model: "copilot-selected-model", steps: 5, tags: "ui,api,db,async,vision" },
        actions: [{
          label: "Generated DSL",
          title: "Fake Scenario DSL",
          content: JSON.stringify(fakeDsl)
        }]
      },
      {
        time: "10:00:20",
        stage: "Engine Run",
        status: "success",
        title: "Completed",
        detail: "HTTP 200",
        meta: { endpoint: "http://localhost:9090/engine/run", method: "POST", status: 200, duration_ms: 28439, assertions_passed: 12, assertions_failed: 0 },
        actions: [{
          label: "Engine Output",
          title: "Fake Engine Result",
          content: JSON.stringify(fakeEngineResult)
        }]
      },
      {
        time: "10:00:21",
        stage: "Artifacts",
        status: "success",
        title: "Persisted",
        detail: "/workspace/.flowtest-runs/fake",
        meta: { output_path: "/workspace/.flowtest-runs/fake", files: 4 },
        actions: [{ label: "Output Files", title: "Fake Output Paths", content: "api-spec.md\nwiremock-mappings.json\nscenario.dsl.json\nengine-run-result.json" }]
      }
    ]
  };
}
