# flowtest

`flowtest` is a VS Code Copilot Chat participant (`@flowtest`) modeled after your `demo_extension` form experience.

## Chat Usage

- `@flowtest help`
- `@flowtest start`
- `@flowtest forms`
- `@flowtest open_scenario_form`
- `@flowtest open_mocks_form`
- `@flowtest open_vision_form`
- `@flowtest show report`

All form styling/behavior follows the same pattern as your demo extension, but with FlowTest-native forms.

`@flowtest start` opens a simplified intake form with:
- Success Samples (1..N)
- Failure Samples (0..N)
- AID (single)
- HLD (single)

File upload and paste are both supported.

The command then orchestrates:
1. API spec generation
2. WireMock generation
3. Scenario DSL generation
4. Engine validation run via Temporal (`/api/scenarios/run-temporal`)

And posts a chat audit trail including a Temporal UI link.

`@flowtest start` also supports an **Output Path** in the form. Generated artifacts are persisted to disk:
- `api-spec.md`
- `wiremock-mappings.json`
- `scenario.dsl.json`
- `engine-run-result.json`

## Java Engine Integration

Bridge endpoints exposed by extension:

- `POST http://127.0.0.1:7171/flowtest/ai/execute`
- `POST http://127.0.0.1:7171/flowtest/events`
- `GET http://127.0.0.1:7171/flowtest/health`

Set your Java engine:

```yaml
flowtest:
  temporal:
    enabled: true
    target: 127.0.0.1:7233
    namespace: default
    task-queue: flowtest-task-queue
  ai:
    mode: copilot
    external:
      enabled: true
      endpoint: http://127.0.0.1:7171/flowtest/ai/execute
  execution:
    callbacks:
      webhook-enabled: true
      webhook-url: http://127.0.0.1:7171/flowtest/events
```

## Allure Report Command

`@flowtest show report` will:

1. Run `allure generate allure-results -o allure-report --clean`
2. Open `allure-report/index.html`

This expects `allure` CLI to be installed and available in your PATH.

## Commands

- `FlowTest: Open Forms`
- `FlowTest: Start Bridge`
- `FlowTest: Stop Bridge`

## Development

```bash
cd flowtest-copilot-extension
npm install
npm run compile
```
