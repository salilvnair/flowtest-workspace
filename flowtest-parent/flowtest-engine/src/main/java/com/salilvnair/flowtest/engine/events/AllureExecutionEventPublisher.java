package com.salilvnair.flowtest.engine.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salilvnair.flowtest.engine.config.FlowTestAllureProperties;
import io.qameta.allure.Allure;
import io.qameta.allure.AllureLifecycle;
import io.qameta.allure.model.Label;
import io.qameta.allure.model.Parameter;
import io.qameta.allure.model.Status;
import io.qameta.allure.model.StatusDetails;
import io.qameta.allure.model.StepResult;
import io.qameta.allure.model.TestResult;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class AllureExecutionEventPublisher implements ExecutionEventPublisher {

    private final FlowTestAllureProperties properties;
    private final ObjectMapper objectMapper;
    private AllureLifecycle lifecycle;
    private final Map<String, String> scenarioTestUuidMap = new ConcurrentHashMap<>();
    private final Map<String, String> stepUuidMap = new ConcurrentHashMap<>();

    @PostConstruct
    void init() {
        if (properties.getResultsDirectory() != null && !properties.getResultsDirectory().isBlank()) {
            System.setProperty("allure.results.directory", properties.getResultsDirectory());
        }
        lifecycle = Allure.getLifecycle();
    }

    @Override
    public void publish(ExecutionEvent event) {
        if (!properties.isEnabled()) {
            return;
        }
        if (event == null || event.scenarioId() == null || event.scenarioId().isBlank()) {
            return;
        }

        switch (event.type()) {
            case RUN_STARTED -> onRunStarted(event);
            case STEP_STARTED -> onStepStarted(event);
            case STEP_PASSED -> onStepPassed(event);
            case STEP_FAILED -> onStepFailed(event);
            case RUN_COMPLETED -> onRunCompleted(event);
            default -> {
            }
        }
    }

    private void onRunStarted(ExecutionEvent event) {
        String scenarioId = event.scenarioId();
        String scenarioName = String.valueOf(event.payload() == null ? "" : event.payload().getOrDefault("name", scenarioId));

        String testUuid = UUID.randomUUID().toString();
        scenarioTestUuidMap.put(scenarioId, testUuid);

        TestResult testResult = new TestResult()
                .setUuid(testUuid)
                .setName(scenarioName)
                .setFullName("flowtest." + scenarioId)
                .setHistoryId(scenarioId)
                .setDescription("FlowTest automated execution for scenario `" + scenarioId + "`")
                .setLabels(defaultLabels(scenarioId, scenarioName))
                .setParameters(defaultParameters(event));

        lifecycle.scheduleTestCase(testResult);
        lifecycle.startTestCase(testUuid);

        addAttachment("run-start-payload", event.payload());
    }

    private void onStepStarted(ExecutionEvent event) {
        String scenarioId = event.scenarioId();
        String testUuid = scenarioTestUuidMap.get(scenarioId);
        if (testUuid == null || event.stepId() == null || event.stepId().isBlank()) {
            return;
        }

        String stepKey = stepKey(scenarioId, event.stepId());
        String stepUuid = UUID.randomUUID().toString();
        stepUuidMap.put(stepKey, stepUuid);

        String stepType = String.valueOf(event.payload() == null ? "" : event.payload().getOrDefault("type", "step"));
        String requestMethod = String.valueOf(event.payload() == null ? "" : event.payload().getOrDefault("requestMethod", ""));
        String requestUrl = String.valueOf(event.payload() == null ? "" : event.payload().getOrDefault("requestUrl", ""));
        String stepName = event.stepId() + " [" + stepType + "]";
        if (!requestMethod.isBlank() || !requestUrl.isBlank()) {
            stepName += " - " + requestMethod + " " + requestUrl;
        }

        lifecycle.startStep(testUuid, stepUuid, new StepResult().setName(stepName));
        addAttachment("step-start-" + event.stepId(), event.payload());
    }

    private void onStepPassed(ExecutionEvent event) {
        String scenarioId = event.scenarioId();
        String stepId = event.stepId();
        if (stepId == null || stepId.isBlank()) {
            return;
        }

        String stepKey = stepKey(scenarioId, stepId);
        String stepUuid = stepUuidMap.get(stepKey);
        if (stepUuid == null) {
            return;
        }

        Object output = event.payload() == null ? null : event.payload().get("output");
        if (output != null) {
            addAttachment("step-output-" + stepId, output);
        }
        addAttachment("step-pass-meta-" + stepId, event.payload());

        lifecycle.updateStep(stepUuid, step -> step.setStatus(Status.PASSED));
        lifecycle.stopStep(stepUuid);
    }

    private void onStepFailed(ExecutionEvent event) {
        String scenarioId = event.scenarioId();
        String stepId = event.stepId();
        if (stepId == null || stepId.isBlank()) {
            return;
        }

        String stepKey = stepKey(scenarioId, stepId);
        String stepUuid = stepUuidMap.get(stepKey);
        if (stepUuid == null) {
            return;
        }

        String error = String.valueOf(event.payload() == null ? "unknown" : event.payload().getOrDefault("error", "unknown"));
        addAttachment("step-error-" + stepId, error);
        addAttachment("step-fail-meta-" + stepId, event.payload());

        lifecycle.updateStep(stepUuid, step -> step
                .setStatus(Status.FAILED)
                .setStatusDetails(new StatusDetails().setMessage(error)));
        lifecycle.stopStep(stepUuid);
    }

    private void onRunCompleted(ExecutionEvent event) {
        String scenarioId = event.scenarioId();
        String testUuid = scenarioTestUuidMap.get(scenarioId);
        if (testUuid == null) {
            return;
        }

        boolean success = parseSuccess(event.payload());
        addAttachment("run-completed-payload", event.payload());
        lifecycle.updateTestCase(testUuid, testCase -> {
            testCase.setStatus(success ? Status.PASSED : Status.FAILED);
            testCase.setLabels(appendExecutionLabels(testCase.getLabels(), success));
            if (!success) {
                String failureStepId = String.valueOf(event.payload() == null ? "" : event.payload().getOrDefault("failureStepId", ""));
                testCase.setStatusDetails(new StatusDetails().setMessage("Failed at step: " + failureStepId));
            }
        });
        lifecycle.stopTestCase(testUuid);
        lifecycle.writeTestCase(testUuid);

        clearScenarioState(scenarioId);
    }

    private void addAttachment(String name, Object payload) {
        Allure.addAttachment(name + ".json", "application/json", asJson(payload), "json");
    }

    private String asJson(Object payload) {
        if (payload == null) {
            return "{}";
        }
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            return String.valueOf(payload);
        }
    }

    private List<Label> defaultLabels(String scenarioId, String scenarioName) {
        List<Label> labels = new ArrayList<>();
        labels.add(new Label().setName("framework").setValue("flowtest"));
        labels.add(new Label().setName("language").setValue("java"));
        labels.add(new Label().setName("suite").setValue("FlowTest Engine Runs"));
        labels.add(new Label().setName("parentSuite").setValue("FlowTest"));
        labels.add(new Label().setName("subSuite").setValue(scenarioName));
        labels.add(new Label().setName("host").setValue(String.valueOf(System.getProperty("user.name", "unknown"))));
        labels.add(new Label().setName("thread").setValue(Thread.currentThread().getName()));
        labels.add(new Label().setName("tag").setValue("scenarioId:" + scenarioId));
        labels.add(new Label().setName("tag").setValue("triggeredAt:" + Instant.now()));
        return labels;
    }

    private List<Label> appendExecutionLabels(List<Label> existing, boolean success) {
        List<Label> labels = existing == null ? new ArrayList<>() : new ArrayList<>(existing);
        labels.add(new Label().setName("tag").setValue("execution:" + (success ? "passed" : "failed")));
        return labels;
    }

    private List<Parameter> defaultParameters(ExecutionEvent event) {
        List<Parameter> parameters = new ArrayList<>();
        if (event.payload() == null) {
            return parameters;
        }
        addParameter(parameters, "scenarioId", event.payload().get("scenarioId"));
        addParameter(parameters, "dslVersion", event.payload().get("dslVersion"));
        addParameter(parameters, "stepCount", event.payload().get("stepCount"));
        addParameter(parameters, "allureResultsDirectory", event.payload().get("allureResultsDirectory"));
        return parameters;
    }

    private void addParameter(List<Parameter> params, String name, Object value) {
        if (value == null) {
            return;
        }
        params.add(new Parameter().setName(name).setValue(String.valueOf(value)));
    }

    private boolean parseSuccess(Map<String, Object> payload) {
        if (payload == null || payload.get("success") == null) {
            return false;
        }
        Object value = payload.get("success");
        if (value instanceof Boolean b) {
            return b;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private String stepKey(String scenarioId, String stepId) {
        return scenarioId + "::" + stepId;
    }

    private void clearScenarioState(String scenarioId) {
        scenarioTestUuidMap.remove(scenarioId);
        stepUuidMap.keySet().removeIf(key -> key.startsWith(scenarioId + "::"));
    }
}
