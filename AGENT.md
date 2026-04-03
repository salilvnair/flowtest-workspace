# AGENT.md — FlowTest

## 1. What this project is

**FlowTest** is an autonomous, AI-assisted, end-to-end flow validation platform.

It is **not** just a UI automation framework.

It validates complete business flows across:

- UI
- REST APIs
- SOAP APIs
- downstream dependencies
- async workflows
- database truth
- screenshot comparison
- vision-based assertions

FlowTest combines:

- a **deterministic execution engine** in **Java / Spring Boot**
- an **AI agent layer** in **Python**
- a **gRPC bridge** between Java and Python
- **WireMock** for mock/stub generation and dependency simulation
- **Playwright** for UI execution
- a **Vision service** for screenshot comparison and semantic UI validation

---

## 2. Product philosophy

### Core principle
**Validate truth, not just pixels.  
Validate state, not just screens.  
Use UI as an entry point, not as the whole test.**

### Why this exists
Traditional E2E testing becomes brittle when systems include:

- 8–10 downstream APIs
- UI-triggered flows
- async processing
- DB function validation
- multiple layers of state transitions
- callbacks / polling / eventual consistency

FlowTest reduces fragile browser-heavy tests by shifting most validation to:

- API contracts
- mocks/stubs
- workflow truth
- database truth
- screenshot and semantic vision validation

---

## 3. High-level system architecture

```text
Python AI Layer
   ├── Agent1: API Intelligence Agent
   ├── Agent2: Mock Intelligence Agent
   ├── Agent3: Scenario Generator Agent
   └── Agent4: Vision Understanding Agent
            │
            │ gRPC
            ▼
Java Execution Engine (Spring Boot)
   ├── DSL Runner
   ├── Step Dispatcher
   ├── WireMock Integration
   ├── API Executors
   ├── DB Validators
   ├── Async / Workflow Validators
   ├── Playwright UI Adapter
   └── Report Generator
            │
            ▼
System Under Test
   ├── UI
   ├── REST/SOAP APIs
   ├── Downstream systems
   ├── Async jobs/workflows
   └── Database
```

---

## 4. AI agent responsibilities

## Agent1 — API Intelligence Agent
Reads:
- AID documents
- HLD
- code samples
- OpenAPI / Swagger / WSDL if available
- sample requests/responses

Produces:
- normalized API spec
- request schema
- response schema
- inferred contracts
- dependency map

### Example Agent1 output

```json
{
  "apis": [
    {
      "name": "createOrder",
      "method": "POST",
      "path": "/orders",
      "requestSchema": {},
      "responseSchema": {},
      "dependencies": ["inventory", "billing"]
    }
  ]
}
```

---

## Agent2 — Mock Intelligence Agent
Reads:
- Agent1 API output
- samples
- payload examples
- business scenarios

Produces:
- WireMock mappings
- mock stubs
- latency injection scenarios
- failure simulations
- retry/error cases

### Example Agent2 output

```json
{
  "wiremock": [
    {
      "request": {},
      "response": {},
      "scenarios": [
        "success",
        "timeout",
        "partial-failure"
      ]
    }
  ]
}
```

---

## Agent3 — Scenario Generator Agent
Reads:
- Agent1 API understanding
- Agent2 mock definitions
- HLD
- AID
- business rules
- workflow expectations

Produces:
- FlowTest DSL scenarios

### Example Agent3 output

```json
{
  "scenarioId": "order-flow-success",
  "steps": []
}
```

---

## Agent4 — Vision Understanding Agent
Reads:
- UI screenshots
- UI intent
- HLD / acceptance criteria
- expected user-visible outcomes

Produces:
- semantic UI checks
- screenshot validation rules
- vision assertions

### Example Agent4 output

```json
{
  "visionChecks": [
    "success message visible",
    "order id present",
    "no error banner"
  ]
}
```

---

## 5. Deterministic engine vs AI layer

### AI is responsible for:
- generating API specs
- generating mocks
- generating DSL scenarios
- generating vision checks
- analyzing failures and suggesting improvements

### Java deterministic engine is responsible for:
- parsing DSL
- validating schema
- executing steps
- calling APIs
- setting up WireMock
- executing DB queries/functions
- running UI steps
- invoking vision service
- deciding pass/fail
- generating reports

### Important rule
**AI must not decide runtime pass/fail logic.  
The deterministic engine owns execution truth.**

---

## 6. DSL contract

The DSL is the single execution contract between AI generation and the engine.

### DSL principles
- strict
- versioned
- schema-validated
- deterministic
- environment-independent where possible

### Example top-level DSL structure

```json
{
  "dslVersion": "1.0",
  "scenarioId": "new-connection-success",
  "name": "New connection request completes successfully",
  "tags": ["ui", "api", "async", "db", "vision"],
  "config": {
    "baseUrl": "http://localhost:8080",
    "uiBaseUrl": "http://localhost:4200",
    "timeoutMs": 120000,
    "pollIntervalMs": 3000
  },
  "data": {
    "customerId": "CUST1001",
    "zip": "75019",
    "address": "123 Main St",
    "plan": "PREMIUM"
  },
  "mocks": [],
  "steps": [],
  "cleanup": []
}
```

---

## 7. Example DSL scenario

```json
{
  "scenarioId": "new-connection-success",
  "name": "New connection request completes successfully",
  "tags": ["ui", "api", "async", "db"],
  "config": {
    "baseUrl": "http://localhost:8080",
    "uiBaseUrl": "http://localhost:4200",
    "timeoutMs": 120000,
    "pollIntervalMs": 3000
  },
  "data": {
    "customerId": "CUST1001",
    "zip": "75019",
    "address": "123 Main St",
    "plan": "PREMIUM"
  },
  "mocks": [
    {
      "type": "wiremock",
      "name": "availability-api",
      "request": {
        "method": "POST",
        "url": "/external/availability/check"
      },
      "response": {
        "status": 200,
        "jsonBody": {
          "serviceAvailable": true
        }
      }
    }
  ],
  "steps": [
    {
      "id": "submitRequest",
      "type": "ui-action",
      "action": "submitForm",
      "page": "newConnectionPage",
      "input": {
        "zip": "${data.zip}",
        "address": "${data.address}",
        "plan": "${data.plan}"
      },
      "save": {
        "requestId": "$.requestId"
      }
    },
    {
      "id": "checkApiResponse",
      "type": "api-assert",
      "request": {
        "method": "GET",
        "url": "/api/requests/${context.requestId}"
      },
      "assertions": [
        {
          "type": "status",
          "expected": 200
        },
        {
          "type": "json-path",
          "path": "$.status",
          "expected": "SUBMITTED"
        }
      ]
    },
    {
      "id": "waitForAsyncCompletion",
      "type": "wait-until",
      "until": {
        "type": "db-query",
        "sql": "select status from request_tracker where request_id = ?",
        "params": ["${context.requestId}"],
        "expectedSingleValue": "COMPLETED"
      },
      "timeoutMs": 90000,
      "pollIntervalMs": 5000
    },
    {
      "id": "validateDbFunction",
      "type": "db-function",
      "function": "fn_validate_request",
      "params": ["${context.requestId}"],
      "assertions": [
        {
          "type": "equals",
          "expected": "SUCCESS"
        }
      ]
    }
  ],
  "cleanup": [
    {
      "type": "sql",
      "sql": "delete from request_tracker where request_id = ?",
      "params": ["${context.requestId}"]
    }
  ]
}
```

---

## 8. DSL step categories

## Action steps
- `ui-action`
- `api-call`
- `sql`
- `db-function`
- `temporal-signal`
- `publish-event`
- `seed-data`
- `capture-screenshot`

## Wait steps
- `wait-until`
- `sleep`
- `wait-for-workflow`
- `wait-for-callback`
- `wait-for-db-state`

## Validation steps
- `api-assert`
- `db-assert`
- `json-assert`
- `workflow-assert`
- `wiremock-verify`
- `vision-assert`
- `file-assert`

## Utility steps
- `set-context`
- `extract`
- `log`
- `cleanup`

---

## 9. Vision-based validation

FlowTest must support:

- screenshot capture
- baseline comparison
- screenshot diffing
- structural comparison
- AI semantic UI validation

### Screenshot comparison levels

#### Level 1 — Pixel Diff
Fast exact comparison.

```python
from PIL import ImageChops, Image

def pixel_diff(img1, img2):
    diff = ImageChops.difference(img1, img2)
    return diff.getbbox() is None
```

#### Level 2 — Structural Diff
Use SSIM for tolerance.

```python
from skimage.metrics import structural_similarity as ssim
import cv2

score, diff = ssim(img1, img2, full=True)
```

#### Level 3 — Vision AI
Use a vision-capable model to answer semantic UI questions such as:

- Is success message shown?
- Is order ID visible?
- Is an error banner present?
- Is the expected screen shown?

### Example Vision Prompt

```text
You are a UI validation agent.

Given this screenshot:
- Verify if the page shows a successful order confirmation.
- Check if an order ID is visible.
- Check if there are any error messages.

Respond in JSON:
{
  "success": true/false,
  "orderIdVisible": true/false,
  "errorVisible": true/false
}
```

### Example DSL for vision

```json
{
  "id": "validate-ui-success",
  "type": "vision-assert",
  "screenshot": "step-confirmation.png",
  "checks": [
    {
      "type": "text-visible",
      "value": "Order Confirmed"
    },
    {
      "type": "element-present",
      "description": "order id number"
    },
    {
      "type": "no-error"
    }
  ]
}
```

### Example simplified DSL with screenshot + vision

```json
{
  "steps": [
    {
      "type": "ui-action",
      "action": "submitOrder"
    },
    {
      "type": "capture-screenshot",
      "name": "after-submit"
    },
    {
      "type": "vision-assert",
      "checks": [
        "loading spinner visible"
      ]
    },
    {
      "type": "wait-until",
      "db": "order status = COMPLETED"
    },
    {
      "type": "capture-screenshot",
      "name": "confirmation"
    },
    {
      "type": "vision-assert",
      "checks": [
        "success message visible",
        "order id present"
      ]
    }
  ]
}
```

---

## 10. gRPC architecture

gRPC is the bridge between Java and Python.

Use gRPC for:

- Java → Python vision analysis
- Java ↔ Python agent calls
- Python → Java scenario execution trigger

### Architecture

```text
Python AI Orchestrator
   ├── Agent1
   ├── Agent2
   ├── Agent3
   └── Agent4 / Vision
            │
            │ gRPC
            ▼
Java Execution Engine
   ├── DSL Runner
   ├── API / DB / UI / WireMock / Workflow adapters
   └── Report generation
```

---

## 11. Protobuf contracts

## vision.proto

```proto
syntax = "proto3";

package vision;

service VisionService {
  rpc AnalyzeScreenshot (VisionRequest) returns (VisionResponse);
}

message VisionRequest {
  string imageBase64 = 1;
  repeated string checks = 2;
  string context = 3;
}

message VisionResponse {
  bool success = 1;
  repeated VisionResult results = 2;
}

message VisionResult {
  string check = 1;
  bool passed = 2;
  string explanation = 3;
}
```

## execution.proto

```proto
syntax = "proto3";

package execution;

service ScenarioExecutionService {
  rpc RunScenario (ScenarioRequest) returns (ScenarioResponse);
}

message ScenarioRequest {
  string scenarioJson = 1;
}

message ScenarioResponse {
  bool success = 1;
  repeated StepResult steps = 2;
  string errorMessage = 3;
}

message StepResult {
  string stepId = 1;
  string status = 2;
  string output = 3;
}
```

## agent.proto

```proto
syntax = "proto3";

package agent;

service AgentService {
  rpc GenerateApiSpec (AgentRequest) returns (AgentResponse);
  rpc GenerateMocks (AgentRequest) returns (AgentResponse);
  rpc GenerateScenario (AgentRequest) returns (AgentResponse);
}

message AgentRequest {
  string input = 1;
}

message AgentResponse {
  string outputJson = 1;
}
```

---

## 12. Python gRPC Vision server

```python
import grpc
from concurrent import futures
import base64

import vision_pb2
import vision_pb2_grpc

class VisionService(vision_pb2_grpc.VisionServiceServicer):

    def AnalyzeScreenshot(self, request, context):
        image_bytes = base64.b64decode(request.imageBase64)

        results = []

        for check in request.checks:
            results.append(
                vision_pb2.VisionResult(
                    check=check,
                    passed=True,
                    explanation="Mock passed"
                )
            )

        return vision_pb2.VisionResponse(
            success=True,
            results=results
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    vision_pb2_grpc.add_VisionServiceServicer_to_server(
        VisionService(), server
    )
    server.add_insecure_port('[::]:50051')
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
```

---

## 13. Java gRPC client for Vision service

```java
package com.salilvnair.flowtest.vision;

import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import vision.VisionRequest;
import vision.VisionResponse;
import vision.VisionServiceGrpc;

import java.util.Base64;
import java.util.List;

public class VisionGrpcClient {

    private final VisionServiceGrpc.VisionServiceBlockingStub stub;

    public VisionGrpcClient() {
        ManagedChannel channel = ManagedChannelBuilder
                .forAddress("localhost", 50051)
                .usePlaintext()
                .build();

        this.stub = VisionServiceGrpc.newBlockingStub(channel);
    }

    public VisionResponse analyze(byte[] screenshot, List<String> checks) {
        String base64 = Base64.getEncoder().encodeToString(screenshot);

        VisionRequest request = VisionRequest.newBuilder()
                .setImageBase64(base64)
                .addAllChecks(checks)
                .build();

        return stub.analyzeScreenshot(request);
    }
}
```

---

## 14. Vision Step Executor in Java

```java
package com.salilvnair.flowtest.step.vision;

import com.salilvnair.flowtest.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.ExecutionContext;
import com.salilvnair.flowtest.engine.StepRunResult;
import com.salilvnair.flowtest.step.StepExecutor;
import com.salilvnair.flowtest.vision.VisionGrpcClient;
import org.springframework.stereotype.Component;
import vision.VisionResponse;

import java.util.List;

@Component
public class VisionAssertStepExecutor implements StepExecutor {

    private final VisionGrpcClient client = new VisionGrpcClient();

    @Override
    public boolean supports(String stepType) {
        return "vision-assert".equals(stepType);
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = new StepRunResult(step.getId(), step.getType());

        try {
            byte[] screenshot = (byte[]) context.get("lastScreenshot");
            List<String> checks = (List<String>) step.getInput().get("checks");

            VisionResponse response = client.analyze(screenshot, checks);

            boolean success = response.getSuccess();

            result.setSuccess(success);
            result.setOutput(response.toString());

            return result;
        }
        catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            return result;
        }
    }
}
```

---

## 15. UI strategy

Use UI as the entry point, not the center of validation.

### Use Playwright for:
- data entry
- clicks
- navigation
- capturing correlation IDs
- screenshots

### Do not rely only on:
- selectors
- long brittle UI chains
- superficial UI-only assertions

### Screenshot capture example

```java
public byte[] captureScreenshot(Page page) {
    return page.screenshot();
}
```

Save screenshots under a per-run directory:

```text
/run-123/step-submit.png
/run-123/step-confirmation.png
```

---

## 16. Spring Boot execution engine architecture

The Java engine should be layered like this:

### A. Scenario Definition Layer
- reads JSON test scenario files
- parses and validates DSL

### B. Orchestration Engine
- executes steps in order
- manages execution context
- coordinates step outputs

### C. Adapter Layer
- pluggable executors for step types

### D. Validation Layer
- generic assertion engine
- API / DB / workflow / vision / mock assertions

### E. Async Coordination Layer
- polling
- timeouts
- eventual consistency checks

### F. Reporting Layer
- HTML and JSON reports
- diagnostics and artifacts

---

## 17. Recommended folder structure

```text
flowtest-framework/
├── pom.xml
├── src/
│   ├── main/
│   │   ├── java/com/salilvnair/flowtest/
│   │   │   ├── FlowTestApplication.java
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── JacksonConfig.java
│   │   │   │   ├── WireMockConfig.java
│   │   │   │   ├── DataSourceConfig.java
│   │   │   │   ├── TemporalConfig.java
│   │   │   │   └── FrameworkProperties.java
│   │   │   │
│   │   │   ├── dsl/
│   │   │   │   ├── model/
│   │   │   │   │   ├── TestScenario.java
│   │   │   │   │   ├── ScenarioConfig.java
│   │   │   │   │   ├── ScenarioStep.java
│   │   │   │   │   ├── MockDefinition.java
│   │   │   │   │   ├── AssertionDefinition.java
│   │   │   │   │   └── CleanupStep.java
│   │   │   │   ├── parser/
│   │   │   │   │   ├── ScenarioParser.java
│   │   │   │   │   └── ScenarioSchemaValidator.java
│   │   │   │   └── resolver/
│   │   │   │       ├── VariableResolver.java
│   │   │   │       └── JsonPathResolver.java
│   │   │   │
│   │   │   ├── engine/
│   │   │   │   ├── ScenarioEngine.java
│   │   │   │   ├── StepDispatcher.java
│   │   │   │   ├── ExecutionContext.java
│   │   │   │   ├── ScenarioRunResult.java
│   │   │   │   ├── StepRunResult.java
│   │   │   │   └── ExecutionStatus.java
│   │   │   │
│   │   │   ├── step/
│   │   │   │   ├── StepExecutor.java
│   │   │   │   ├── AbstractStepExecutor.java
│   │   │   │   ├── api/
│   │   │   │   │   ├── ApiCallStepExecutor.java
│   │   │   │   │   └── ApiAssertStepExecutor.java
│   │   │   │   ├── db/
│   │   │   │   │   ├── SqlStepExecutor.java
│   │   │   │   │   ├── DbAssertStepExecutor.java
│   │   │   │   │   └── DbFunctionStepExecutor.java
│   │   │   │   ├── ui/
│   │   │   │   │   ├── UiActionStepExecutor.java
│   │   │   │   │   └── PlaywrightAdapter.java
│   │   │   │   ├── mock/
│   │   │   │   │   ├── WireMockStepExecutor.java
│   │   │   │   │   └── WireMockVerificationExecutor.java
│   │   │   │   ├── wait/
│   │   │   │   │   ├── WaitUntilStepExecutor.java
│   │   │   │   │   └── PollingService.java
│   │   │   │   ├── temporal/
│   │   │   │   │   ├── TemporalSignalStepExecutor.java
│   │   │   │   │   ├── WorkflowAssertStepExecutor.java
│   │   │   │   │   └── TemporalQueryService.java
│   │   │   │   └── vision/
│   │   │   │       └── VisionAssertStepExecutor.java
│   │   │   │
│   │   │   ├── assertion/
│   │   │   │   ├── AssertionEngine.java
│   │   │   │   ├── AssertionHandler.java
│   │   │   │   ├── status/
│   │   │   │   ├── json/
│   │   │   │   ├── db/
│   │   │   │   └── workflow/
│   │   │   │
│   │   │   ├── report/
│   │   │   │   ├── ReportService.java
│   │   │   │   ├── HtmlReportGenerator.java
│   │   │   │   └── JsonReportGenerator.java
│   │   │   │
│   │   │   ├── support/
│   │   │   │   ├── HttpClientSupport.java
│   │   │   │   ├── JdbcSupport.java
│   │   │   │   ├── JsonSupport.java
│   │   │   │   └── ClockSupport.java
│   │   │   │
│   │   │   ├── vision/
│   │   │   │   └── VisionGrpcClient.java
│   │   │   │
│   │   │   └── runner/
│   │   │       ├── ScenarioRunner.java
│   │   │       └── CommandLineScenarioRunner.java
│   │   │
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── scenarios/
│   │       │   ├── new-connection-success.json
│   │       │   ├── new-connection-api-failure.json
│   │       │   └── async-timeout-validation.json
│   │       └── schema/
│   │           └── scenario-schema.json
│   │
│   └── test/
│       ├── java/com/salilvnair/flowtest/
│       │   ├── engine/
│       │   ├── step/
│       │   ├── assertion/
│       │   └── integration/
│       └── resources/
│           └── test-scenarios/
```

---

## 18. Core domain models

## TestScenario.java

```java
package com.salilvnair.flowtest.dsl.model;

import java.util.List;
import java.util.Map;

public class TestScenario {
    private String scenarioId;
    private String name;
    private List<String> tags;
    private ScenarioConfig config;
    private Map<String, Object> data;
    private List<MockDefinition> mocks;
    private List<ScenarioStep> steps;
    private List<CleanupStep> cleanup;

    public String getScenarioId() { return scenarioId; }
    public void setScenarioId(String scenarioId) { this.scenarioId = scenarioId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }

    public ScenarioConfig getConfig() { return config; }
    public void setConfig(ScenarioConfig config) { this.config = config; }

    public Map<String, Object> getData() { return data; }
    public void setData(Map<String, Object> data) { this.data = data; }

    public List<MockDefinition> getMocks() { return mocks; }
    public void setMocks(List<MockDefinition> mocks) { this.mocks = mocks; }

    public List<ScenarioStep> getSteps() { return steps; }
    public void setSteps(List<ScenarioStep> steps) { this.steps = steps; }

    public List<CleanupStep> getCleanup() { return cleanup; }
    public void setCleanup(List<CleanupStep> cleanup) { this.cleanup = cleanup; }
}
```

## ScenarioStep.java

```java
package com.salilvnair.flowtest.dsl.model;

import java.util.List;
import java.util.Map;

public class ScenarioStep {
    private String id;
    private String type;
    private String action;
    private String page;
    private Map<String, Object> input;
    private Map<String, Object> request;
    private List<AssertionDefinition> assertions;
    private Map<String, String> save;
    private String sql;
    private List<Object> params;
    private Long timeoutMs;
    private Long pollIntervalMs;
    private Map<String, Object> until;
    private String function;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getPage() { return page; }
    public void setPage(String page) { this.page = page; }

    public Map<String, Object> getInput() { return input; }
    public void setInput(Map<String, Object> input) { this.input = input; }

    public Map<String, Object> getRequest() { return request; }
    public void setRequest(Map<String, Object> request) { this.request = request; }

    public List<AssertionDefinition> getAssertions() { return assertions; }
    public void setAssertions(List<AssertionDefinition> assertions) { this.assertions = assertions; }

    public Map<String, String> getSave() { return save; }
    public void setSave(Map<String, String> save) { this.save = save; }

    public String getSql() { return sql; }
    public void setSql(String sql) { this.sql = sql; }

    public List<Object> getParams() { return params; }
    public void setParams(List<Object> params) { this.params = params; }

    public Long getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(Long timeoutMs) { this.timeoutMs = timeoutMs; }

    public Long getPollIntervalMs() { return pollIntervalMs; }
    public void setPollIntervalMs(Long pollIntervalMs) { this.pollIntervalMs = pollIntervalMs; }

    public Map<String, Object> getUntil() { return until; }
    public void setUntil(Map<String, Object> until) { this.until = until; }

    public String getFunction() { return function; }
    public void setFunction(String function) { this.function = function; }
}
```

---

## 19. ExecutionContext.java

```java
package com.salilvnair.flowtest.engine;

import java.util.HashMap;
import java.util.Map;

public class ExecutionContext {
    private final Map<String, Object> data = new HashMap<>();
    private final Map<String, Object> stepOutputs = new HashMap<>();

    public void put(String key, Object value) {
        data.put(key, value);
    }

    public Object get(String key) {
        return data.get(key);
    }

    public void putStepOutput(String stepId, Object value) {
        stepOutputs.put(stepId, value);
    }

    public Object getStepOutput(String stepId) {
        return stepOutputs.get(stepId);
    }

    public Map<String, Object> getAllData() {
        return data;
    }

    public Map<String, Object> getAllStepOutputs() {
        return stepOutputs;
    }
}
```

---

## 20. ScenarioEngine.java

```java
package com.salilvnair.flowtest.engine;

import com.salilvnair.flowtest.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.dsl.model.TestScenario;
import org.springframework.stereotype.Service;

@Service
public class ScenarioEngine {

    private final StepDispatcher stepDispatcher;

    public ScenarioEngine(StepDispatcher stepDispatcher) {
        this.stepDispatcher = stepDispatcher;
    }

    public ScenarioRunResult execute(TestScenario scenario) {
        ExecutionContext context = new ExecutionContext();

        if (scenario.getData() != null) {
            scenario.getData().forEach(context::put);
        }

        ScenarioRunResult result = new ScenarioRunResult();
        result.setScenarioId(scenario.getScenarioId());
        result.setScenarioName(scenario.getName());

        for (ScenarioStep step : scenario.getSteps()) {
            StepRunResult stepResult = stepDispatcher.execute(step, context);
            result.getSteps().add(stepResult);

            if (!stepResult.isSuccess()) {
                result.setSuccess(false);
                result.setFailureStepId(step.getId());
                return result;
            }
        }

        result.setSuccess(true);
        return result;
    }
}
```

---

## 21. StepExecutor.java

```java
package com.salilvnair.flowtest.step;

import com.salilvnair.flowtest.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.ExecutionContext;
import com.salilvnair.flowtest.engine.StepRunResult;

public interface StepExecutor {
    boolean supports(String stepType);
    StepRunResult execute(ScenarioStep step, ExecutionContext context);
}
```

---

## 22. ApiCallStepExecutor.java

```java
package com.salilvnair.flowtest.step.api;

import com.salilvnair.flowtest.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.ExecutionContext;
import com.salilvnair.flowtest.engine.StepRunResult;
import com.salilvnair.flowtest.step.StepExecutor;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class ApiCallStepExecutor implements StepExecutor {

    private final RestClient restClient;

    public ApiCallStepExecutor(RestClient.Builder builder) {
        this.restClient = builder.build();
    }

    @Override
    public boolean supports(String stepType) {
        return "api-call".equals(stepType) || "api-assert".equals(stepType);
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = new StepRunResult(step.getId(), step.getType());

        try {
            Map<String, Object> request = step.getRequest();
            String method = String.valueOf(request.get("method"));
            String url = String.valueOf(request.get("url"));

            String responseBody = restClient.method(HttpMethod.valueOf(method))
                    .uri(url)
                    .retrieve()
                    .body(String.class);

            context.putStepOutput(step.getId(), responseBody);
            result.setSuccess(true);
            result.setOutput(responseBody);
            return result;
        }
        catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            return result;
        }
    }
}
```

---

## 23. DbFunctionStepExecutor.java

```java
package com.salilvnair.flowtest.step.db;

import com.salilvnair.flowtest.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.ExecutionContext;
import com.salilvnair.flowtest.engine.StepRunResult;
import com.salilvnair.flowtest.step.StepExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class DbFunctionStepExecutor implements StepExecutor {

    private final JdbcTemplate jdbcTemplate;

    public DbFunctionStepExecutor(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public boolean supports(String stepType) {
        return "db-function".equals(stepType);
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = new StepRunResult(step.getId(), step.getType());

        try {
            String functionName = step.getFunction();
            List<Object> params = step.getParams();

            StringBuilder sql = new StringBuilder("select ");
            sql.append(functionName).append("(");

            for (int i = 0; i < params.size(); i++) {
                sql.append("?");
                if (i < params.size() - 1) {
                    sql.append(",");
                }
            }
            sql.append(")");

            Object output = jdbcTemplate.queryForObject(sql.toString(), Object.class, params.toArray());
            context.putStepOutput(step.getId(), output);

            result.setSuccess(true);
            result.setOutput(output);
            return result;
        }
        catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            return result;
        }
    }
}
```

---

## 24. WaitUntilStepExecutor.java

```java
package com.salilvnair.flowtest.step.wait;

import com.salilvnair.flowtest.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.ExecutionContext;
import com.salilvnair.flowtest.engine.StepRunResult;
import com.salilvnair.flowtest.step.StepExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class WaitUntilStepExecutor implements StepExecutor {

    private final JdbcTemplate jdbcTemplate;

    public WaitUntilStepExecutor(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public boolean supports(String stepType) {
        return "wait-until".equals(stepType);
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = new StepRunResult(step.getId(), step.getType());

        long timeoutMs = step.getTimeoutMs() != null ? step.getTimeoutMs() : 60000;
        long pollMs = step.getPollIntervalMs() != null ? step.getPollIntervalMs() : 3000;
        long start = System.currentTimeMillis();

        try {
            String sql = (String) step.getUntil().get("sql");
            String expected = String.valueOf(step.getUntil().get("expectedSingleValue"));

            while (System.currentTimeMillis() - start < timeoutMs) {
                Object actual = jdbcTemplate.queryForObject(sql, Object.class);
                if (expected.equals(String.valueOf(actual))) {
                    result.setSuccess(true);
                    result.setOutput(actual);
                    return result;
                }
                Thread.sleep(pollMs);
            }

            result.setSuccess(false);
            result.setErrorMessage("Timeout while waiting for expected DB state");
            return result;
        }
        catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            return result;
        }
    }
}
```

---

## 25. Async abstraction

Even if not everything is Temporal yet, design an abstraction:

```java
public interface AsyncFlowProbe {
    String getStatus(String correlationId);
    Object queryState(String correlationId, String queryName);
}
```

This allows implementations for:
- Temporal
- DB-backed jobs
- Kafka / SQS style processing
- custom async systems

---

## 26. Assertion engine design

Assertions should be generic and pluggable.

### Examples
- `equals`
- `not-equals`
- `contains`
- `json-path`
- `status`
- `db-row-count`
- `db-column-value`
- `workflow-status`
- `wiremock-count`

### Assertion handler interface

```java
public interface AssertionHandler {
    boolean supports(String type);
    AssertionResult evaluate(Object actual, Object expected, String path);
}
```

---

## 27. Database-backed reporting

Store run data in framework-owned tables.

### Suggested tables
- `ft_scenario_run`
- `ft_step_run`
- `ft_assertion_run`
- `ft_artifact`

### Example ft_scenario_run
- run_id
- scenario_id
- scenario_name
- status
- started_at
- ended_at
- environment
- trigger_source

### Example ft_step_run
- step_run_id
- run_id
- step_id
- step_type
- status
- input_json
- output_json
- error_message
- started_at
- ended_at

---

## 28. Rich reporting

Generate:
- JSON report
- HTML report

Each step report should include:
- step id
- step type
- start/end time
- resolved inputs
- output
- assertions
- failure reason
- request/response
- SQL executed
- screenshots
- vision results

---

## 29. Suggested Maven dependencies

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter</artifactId>
    </dependency>

    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>

    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-jdbc</artifactId>
    </dependency>

    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>

    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
    </dependency>

    <dependency>
        <groupId>com.jayway.jsonpath</groupId>
        <artifactId>json-path</artifactId>
    </dependency>

    <dependency>
        <groupId>org.wiremock</groupId>
        <artifactId>wiremock-standalone</artifactId>
        <version>3.9.1</version>
    </dependency>

    <dependency>
        <groupId>io.temporal</groupId>
        <artifactId>temporal-sdk</artifactId>
        <version>1.31.0</version>
    </dependency>

    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>

    <dependency>
        <groupId>com.microsoft.playwright</groupId>
        <artifactId>playwright</artifactId>
        <version>1.52.0</version>
    </dependency>

    <dependency>
        <groupId>io.grpc</groupId>
        <artifactId>grpc-netty-shaded</artifactId>
    </dependency>

    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

---

## 30. FlowTest naming and branding

Chosen framework name: **FlowTest**

### Module names
- `flowtest-engine`
- `flowtest-agents`
- `flowtest-vision`
- `flowtest-proto`
- `flowtest-cli`

### Tagline options
- **Test complete system flows, not just endpoints.**
- **From user action to system truth.**
- **End-to-end validation for modern distributed systems.**
- **Autonomous testing for real-world system flows.**

---

## 31. CLI and external integration

### CLI shape
```bash
flowtest run scenario.json
```

### Java execution service
Can be invoked via:
- gRPC
- CLI
- REST wrapper if needed

### Python orchestrator responsibilities
- invoke Agent1 / Agent2 / Agent3 / Agent4
- generate artifacts
- call Java execution engine
- read results
- run feedback loop
- support GitHub Copilot / Codex style automation workflows

---

## 32. Self-driving loop

The long-term autonomous loop:

```text
Generate API understanding
   ↓
Generate mocks
   ↓
Generate DSL scenario
   ↓
Run FlowTest engine
   ↓
Capture failures
   ↓
Feed results back to agents
   ↓
Improve scenario coverage
   ↓
Repeat
```

### Important rule
This loop can generate and refine tests, but deterministic execution remains in Java.

---

## 33. Scope recommendations for v1

### Build first
- DSL parser and validator
- Java engine
- API execution
- DB query / DB function execution
- wait-until polling
- WireMock support
- minimal Playwright UI step support
- screenshot capture
- vision gRPC call
- HTML / JSON reports

### Do not overbuild first
- self-healing selectors
- AI-based execution control
- full visual AI click engine
- massive dashboard
- uncontrolled autonomous mutation of runtime logic

---

## 34. Best first use case

Use one real scenario from the current project with:
- one UI action
- 3 mocked downstream APIs
- one async completion condition
- one DB function validation
- one final visible confirmation check
- one screenshot + vision assertion

Do not start with the hardest 10-API flow.

---

## 35. Implementation notes for Codex

When implementing this system:

1. Keep Java deterministic.
2. Keep AI generation outputs schema-valid.
3. Treat DSL as the contract.
4. Keep UI thin.
5. Shift truth to API/DB/workflow/vision.
6. Use gRPC for Java-Python communication.
7. Prefer pluggable executors.
8. Design for both REST and SOAP.
9. Keep screenshot/vision support first-class.
10. Add clean reporting and artifact storage early.

---

## 36. Important honesty note

This AGENT.md is based on the material visible in the current conversation and visible project context.  
If there were older conversations not present here, they are not fully reproduced word-for-word in this file.

This file is meant to give Codex a strong implementation brief and preserve the major architecture, code snippets, and decisions discussed here.

---

## 37. Final one-line summary

**FlowTest is a Java-first deterministic end-to-end flow validation engine, enhanced by Python AI agents, gRPC, WireMock, Playwright, DB truth checks, async validation, screenshot comparison, and vision-based assertions.**
