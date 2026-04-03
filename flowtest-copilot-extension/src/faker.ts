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
        status: "running",
        title: "Status Panel Initialized",
        detail: "Fake run bootstrapped for UI regression."
      },
      { time: "10:00:02", stage: "Intake", status: "success", title: "Received", detail: "5 docs captured." },
      {
        time: "10:00:05",
        stage: "API Spec",
        status: "running",
        title: "Ai Request Dispatched",
        detail: "task=GENERATE_API_SPEC",
        actions: [{ label: "AI Request", title: "Fake API Spec Prompt", content: "Generate normalized API spec from fake docs." }]
      },
      {
        time: "10:00:08",
        stage: "API Spec",
        status: "success",
        title: "Ai Response Received",
        detail: "17239 chars",
        actions: [{ label: "AI Response", title: "Fake API Spec Response", content: "{ \"openapi\": \"3.0.3\", \"info\": { \"title\": \"Fake\" } }" }]
      },
      {
        time: "10:00:12",
        stage: "WireMock",
        status: "success",
        title: "Completed",
        detail: "Mappings generated.",
        actions: [{ label: "Generated Mocks", title: "Fake WireMock Mappings", content: "[{ \"request\": { \"method\": \"POST\" }, \"response\": { \"status\": 200 } }]" }]
      },
      {
        time: "10:00:16",
        stage: "Scenario DSL",
        status: "success",
        title: "Completed",
        detail: "Scenario generated and validated.",
        actions: [{ label: "Generated DSL", title: "Fake Scenario DSL", content: "{ \"dslVersion\": \"1.0\", \"scenarioId\": \"fake\", \"steps\": [] }" }]
      },
      {
        time: "10:00:20",
        stage: "Engine Run",
        status: "success",
        title: "Completed",
        detail: "HTTP 200",
        actions: [{ label: "Engine Output", title: "Fake Engine Result", content: "{ \"success\": true, \"steps\": [] }" }]
      },
      {
        time: "10:00:21",
        stage: "Artifacts",
        status: "success",
        title: "Persisted",
        detail: "/workspace/.flowtest-runs/fake",
        actions: [{ label: "Output Files", title: "Fake Output Paths", content: "api-spec.md\nwiremock-mappings.json\nscenario.dsl.json\nengine-run-result.json" }]
      }
    ]
  };
}

