# FlowTest

FlowTest is split into deterministic engine and pluggable AI orchestration.

## Modules

Java modules are grouped under `flowtest-parent/`.

- `flowtest-parent/flowtest-engine`: Java deterministic scenario execution engine.
- `flowtest-parent/flowtest-ai-spi`: AI gateway contract.
- `flowtest-parent/flowtest-ai-openai`: OpenAI provider adapter.
- `flowtest-parent/flowtest-ai-external`: Copilot/VS Code external AI bridge adapter.
- `flowtest-parent/flowtest-cli`: CLI wrapper to run scenarios.

## AI Modes

Set in `flowtest-parent/flowtest-engine/src/main/resources/application.yml`:

- `flowtest.ai.mode=openai`: route AI calls to OpenAI adapter.
- `flowtest.ai.mode=copilot`: route AI calls to external adapter (VS Code extension).
- `flowtest.ai.mode=auto`: pick first available provider.
- `flowtest.ai.mode=none`: disable engine-owned AI calls.

## Copilot Extension Integration Contract

### AI task request endpoint (extension receives)

When mode is `copilot`, engine calls:

`POST ${FLOWTEST_EXTERNAL_AI_ENDPOINT}`

Payload:

```json
{
  "taskType": "GENERATE_SCENARIO",
  "prompt": "...",
  "context": {}
}
```

### Scenario run endpoint (extension calls)

`POST /api/scenarios/run`

### Temporal scenario run endpoint (extension calls)

`POST /api/scenarios/run-temporal`

Payload:

```json
{
  "scenario": {
    "dslVersion": "1.0",
    "scenarioId": "sample",
    "name": "Sample",
    "steps": []
  }
}
```

### Execution callbacks (engine pushes during run)

Enable:

- `flowtest.execution.callbacks.webhook-enabled=true`
- `flowtest.execution.callbacks.webhook-url=<extension-callback-url>`

Event payload includes:

- `type` (`RUN_STARTED`, `STEP_STARTED`, `STEP_PASSED`, `STEP_FAILED`, `RUN_COMPLETED`)
- `scenarioId`
- `stepId`
- `at`
- `payload`

## Build

```bash
mvn -q -f flowtest-parent/pom.xml -DskipTests package
```

## Allure Reporting

Allure event publishing is enabled by default in engine config.

- Results directory: `flowtest.reporting.allure.results-directory` (default: `allure-results`)
- Toggle: `flowtest.reporting.allure.enabled`

After running scenarios, generate/open report:

```bash
allure generate allure-results -o allure-report --clean
allure open allure-report
```
