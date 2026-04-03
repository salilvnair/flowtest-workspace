package com.salilvnair.flowtest.engine.api;

import com.salilvnair.flowtest.engine.execution.ScenarioEngine;
import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.temporal.TemporalScenarioOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/scenarios")
@RequiredArgsConstructor
public class ScenarioController {

    private final ScenarioEngine scenarioEngine;
    private final ObjectProvider<TemporalScenarioOrchestrator> temporalOrchestratorProvider;

    @PostMapping("/run")
    public ResponseEntity<?> run(@RequestBody RunScenarioRequest request) {
        if (request == null || request.getScenario() == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_REQUEST",
                    "message", "Missing scenario payload"
            ));
        }

        String validationError = validateScenario(request.getScenario());
        if (validationError != null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_SCENARIO",
                    "message", validationError
            ));
        }

        try {
            ScenarioRunResult result = scenarioEngine.execute(request.getScenario());
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", "ENGINE_EXECUTION_ERROR",
                    "message", ex.getMessage() == null ? "Unexpected engine error" : ex.getMessage()
            ));
        }
    }

    @PostMapping("/run-temporal")
    public ResponseEntity<?> runTemporal(@RequestBody RunScenarioRequest request) {
        if (request == null || request.getScenario() == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_REQUEST",
                    "message", "Missing scenario payload"
            ));
        }

        String validationError = validateScenario(request.getScenario());
        if (validationError != null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_SCENARIO",
                    "message", validationError
            ));
        }

        TemporalScenarioOrchestrator orchestrator = temporalOrchestratorProvider.getIfAvailable();
        if (orchestrator == null) {
            return ResponseEntity.status(503).body(Map.of(
                    "error", "TEMPORAL_NOT_AVAILABLE",
                    "message", "Temporal orchestration is not enabled/available"
            ));
        }

        try {
            return ResponseEntity.ok(orchestrator.run(request.getScenario()));
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", "TEMPORAL_EXECUTION_ERROR",
                    "message", ex.getMessage() == null ? "Temporal execution error" : ex.getMessage()
            ));
        }
    }

    private String validateScenario(TestScenario scenario) {
        if (scenario.getScenarioId() == null || scenario.getScenarioId().isBlank()) {
            return "scenarioId is required";
        }
        if (scenario.getName() == null || scenario.getName().isBlank()) {
            return "name is required";
        }
        if (scenario.getSteps() == null || scenario.getSteps().isEmpty()) {
            return "steps must be a non-empty array";
        }

        Set<String> allowedTypes = Set.of("api-call", "api-assert", "log", "set-context", "sleep");
        for (int i = 0; i < scenario.getSteps().size(); i++) {
            ScenarioStep step = scenario.getSteps().get(i);
            if (step == null) {
                return "steps[" + i + "] is null";
            }
            if (step.getId() == null || step.getId().isBlank()) {
                return "steps[" + i + "].id is required";
            }
            if (step.getType() == null || step.getType().isBlank()) {
                return "steps[" + i + "].type is required";
            }
            if (!allowedTypes.contains(step.getType())) {
                return "steps[" + i + "].type '" + step.getType() + "' is not supported";
            }
            if (("api-call".equals(step.getType()) || "api-assert".equals(step.getType()))) {
                if (step.getRequest() == null) {
                    return "steps[" + i + "].request is required for " + step.getType();
                }
                String method = String.valueOf(step.getRequest().get("method"));
                String url = String.valueOf(step.getRequest().get("url"));
                if (method == null || method.isBlank() || "null".equalsIgnoreCase(method)) {
                    return "steps[" + i + "].request.method is required";
                }
                if (url == null || url.isBlank() || "null".equalsIgnoreCase(url)) {
                    return "steps[" + i + "].request.url is required";
                }
            }
        }
        return null;
    }
}
