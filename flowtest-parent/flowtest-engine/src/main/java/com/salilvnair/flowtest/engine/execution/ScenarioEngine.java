package com.salilvnair.flowtest.engine.execution;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salilvnair.flowtest.engine.config.FlowTestAllureProperties;
import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.events.ExecutionEvent;
import com.salilvnair.flowtest.engine.events.ExecutionEventPublisher;
import com.salilvnair.flowtest.engine.events.ExecutionEventType;
import com.salilvnair.flowtest.engine.step.StepDispatcher;
import com.github.tomakehurst.wiremock.WireMockServer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.request;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;

@Service
@RequiredArgsConstructor
public class ScenarioEngine {

    private static final String CONTEXT_BASE_URL = "__flowtest_base_url";
    private static final String CONTEXT_WIREMOCK_ENABLED = "__flowtest_wiremock_enabled";
    private static final Pattern BASE_URL_TEMPLATE = Pattern.compile("\\{\\{\\s*baseUrl\\s*\\}\\}", Pattern.CASE_INSENSITIVE);

    private final StepDispatcher stepDispatcher;
    private final ExecutionEventPublisher eventPublisher;
    private final FlowTestAllureProperties allureProperties;
    private final ObjectMapper objectMapper;

    public ScenarioRunResult execute(TestScenario scenario) {
        ExecutionContext context = new ExecutionContext();
        Instant runStartedAt = Instant.now();

        if (scenario.getData() != null) {
            scenario.getData().forEach(context::put);
        }

        ScenarioRunResult result = new ScenarioRunResult();
        result.setScenarioId(scenario.getScenarioId());
        result.setScenarioName(scenario.getName());
        result.setAllure(buildAllureRunMetadata());

        WireMockServer wireMockServer = null;
        WireMockRunMetadata wireMockMeta = null;
        try {
            wireMockMeta = bootstrapWireMockIfPossible(scenario);
            result.setWireMock(wireMockMeta);
            if (wireMockMeta != null && wireMockMeta.isEnabled()) {
                wireMockServer = activeWireMock;
                context.put(CONTEXT_BASE_URL, wireMockMeta.getBaseUrl());
                context.put(CONTEXT_WIREMOCK_ENABLED, true);
            }

            eventPublisher.publish(new ExecutionEvent(
                    ExecutionEventType.RUN_STARTED,
                    scenario.getScenarioId(),
                    null,
                    Instant.now(),
                    buildRunStartedPayload(scenario, wireMockMeta)
            ));

            for (ScenarioStep step : scenario.getSteps()) {
                Instant stepStartedAt = Instant.now();
                eventPublisher.publish(new ExecutionEvent(
                        ExecutionEventType.STEP_STARTED,
                        scenario.getScenarioId(),
                        step.getId(),
                        stepStartedAt,
                        buildStepStartedPayload(step)
                ));

                StepRunResult stepResult = stepDispatcher.execute(step, context);
                result.getSteps().add(stepResult);

                if (!stepResult.isSuccess()) {
                    result.setSuccess(false);
                    result.setFailureStepId(step.getId());

                    eventPublisher.publish(new ExecutionEvent(
                            ExecutionEventType.STEP_FAILED,
                            scenario.getScenarioId(),
                            step.getId(),
                            Instant.now(),
                            Map.of(
                                    "error", stepResult.getErrorMessage() == null ? "unknown" : stepResult.getErrorMessage(),
                                    "stepType", stepResult.getStepType() == null ? "" : stepResult.getStepType(),
                                    "durationMs", durationMs(stepStartedAt, Instant.now()),
                                    "output", stepResult.getOutput() == null ? "" : stepResult.getOutput()
                            )
                    ));

                    eventPublisher.publish(new ExecutionEvent(
                            ExecutionEventType.RUN_COMPLETED,
                            scenario.getScenarioId(),
                            null,
                            Instant.now(),
                            buildRunCompletedPayload(result, runStartedAt, Instant.now(), wireMockMeta)
                    ));
                    return result;
                }

                eventPublisher.publish(new ExecutionEvent(
                        ExecutionEventType.STEP_PASSED,
                        scenario.getScenarioId(),
                        step.getId(),
                        Instant.now(),
                        Map.of(
                                "output", stepResult.getOutput() == null ? "" : stepResult.getOutput(),
                                "stepType", stepResult.getStepType() == null ? "" : stepResult.getStepType(),
                                "durationMs", durationMs(stepStartedAt, Instant.now())
                        )
                ));
            }

            result.setSuccess(true);
            eventPublisher.publish(new ExecutionEvent(
                    ExecutionEventType.RUN_COMPLETED,
                    scenario.getScenarioId(),
                    null,
                    Instant.now(),
                    buildRunCompletedPayload(result, runStartedAt, Instant.now(), wireMockMeta)
            ));
            return result;
        } finally {
            if (wireMockServer != null && wireMockServer.isRunning()) {
                wireMockServer.stop();
            }
            activeWireMock = null;
        }
    }

    private WireMockServer activeWireMock;

    private WireMockRunMetadata bootstrapWireMockIfPossible(TestScenario scenario) {
        List<ScenarioStep> apiSteps = scenario.getSteps() == null
                ? List.of()
                : scenario.getSteps().stream()
                .filter(step -> step != null && ("api-call".equals(step.getType()) || "api-assert".equals(step.getType())))
                .toList();
        List<Map<String, Object>> scenarioMocks = scenario.getMocks() == null
                ? List.of()
                : scenario.getMocks().stream()
                .filter(map -> map != null && !map.isEmpty())
                .toList();

        if (apiSteps.isEmpty() && scenarioMocks.isEmpty()) {
            return WireMockRunMetadata.builder().enabled(false).stubCount(0).build();
        }

        WireMockServer server = new WireMockServer(options().dynamicPort());
        server.start();
        int stubCount = 0;

        for (ScenarioStep step : apiSteps) {
            Map<String, Object> reqMap = step.getRequest();
            if (reqMap == null) {
                continue;
            }
            Object mockResponse = reqMap.get("_flowtestMockResponse");
            if (mockResponse == null) {
                continue;
            }

            String method = String.valueOf(reqMap.getOrDefault("method", "GET")).toUpperCase();
            String rawUrl = String.valueOf(reqMap.getOrDefault("url", "/"));
            String path = normalizePath(rawUrl);
            int status = parseStatus(reqMap.get("_flowtestMockStatus"));
            String body = toJsonString(mockResponse);

            server.stubFor(request(method, urlEqualTo(path))
                    .willReturn(aResponse()
                            .withStatus(status)
                            .withHeader("Content-Type", "application/json")
                            .withBody(body)));
            stubCount++;
        }

        // Also support top-level DSL mocks: { request: { method, url }, response: { status, jsonBody/body, headers } }
        for (Map<String, Object> mock : scenarioMocks) {
            Map<String, Object> reqMap = asMap(mock.get("request"));
            if (reqMap == null) {
                continue;
            }
            String method = String.valueOf(reqMap.getOrDefault("method", "GET")).toUpperCase();
            String rawUrl = String.valueOf(reqMap.getOrDefault("url", "/"));
            String path = normalizePath(rawUrl);

            Map<String, Object> resMap = asMap(mock.get("response"));
            int status = parseStatus(resMap == null ? mock.get("status") : resMap.get("status"));
            Object bodyValue = extractMockBody(mock, resMap);
            String body = toJsonString(bodyValue);

            var responseBuilder = aResponse()
                    .withStatus(status)
                    .withHeader("Content-Type", "application/json")
                    .withBody(body);

            Map<String, Object> headers = resMap == null ? null : asMap(resMap.get("headers"));
            if (headers != null && !headers.isEmpty()) {
                for (Map.Entry<String, Object> entry : headers.entrySet()) {
                    if (entry.getKey() == null || entry.getValue() == null) {
                        continue;
                    }
                    responseBuilder.withHeader(entry.getKey(), String.valueOf(entry.getValue()));
                }
            }

            server.stubFor(request(method, urlEqualTo(path)).willReturn(responseBuilder));
            stubCount++;
        }

        if (stubCount == 0) {
            server.stop();
            return WireMockRunMetadata.builder().enabled(false).stubCount(0).build();
        }

        this.activeWireMock = server;
        return WireMockRunMetadata.builder()
                .enabled(true)
                .baseUrl("http://localhost:" + server.port())
                .port(server.port())
                .stubCount(stubCount)
                .build();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new HashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() != null) {
                    out.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
            return out;
        }
        return null;
    }

    private Object extractMockBody(Map<String, Object> mock, Map<String, Object> response) {
        if (response != null) {
            if (response.get("jsonBody") != null) return response.get("jsonBody");
            if (response.get("body") != null) return response.get("body");
            if (response.get("responseBody") != null) return response.get("responseBody");
            Map<String, Object> copy = new HashMap<>(response);
            copy.remove("status");
            copy.remove("headers");
            if (!copy.isEmpty()) {
                return copy;
            }
        }
        if (mock.get("body") != null) return mock.get("body");
        if (mock.get("jsonBody") != null) return mock.get("jsonBody");
        return Map.of();
    }

    private String normalizePath(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            return "/";
        }
        String url = BASE_URL_TEMPLATE.matcher(rawUrl.trim()).replaceAll("");
        if (url.isBlank()) {
            return "/";
        }
        try {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                URI uri = URI.create(url);
                String path = uri.getRawPath();
                String query = uri.getRawQuery();
                if (path == null || path.isBlank()) path = "/";
                return query == null || query.isBlank() ? path : path + "?" + query;
            }
        } catch (Exception ignored) {
            // fallback below
        }
        if (!url.startsWith("/")) {
            url = "/" + url;
        }
        return url;
    }

    private int parseStatus(Object value) {
        if (value == null) return 200;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return 200;
        }
    }

    private String toJsonString(Object payload) {
        if (payload == null) return "{}";
        if (payload instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ignored) {
            return String.valueOf(payload);
        }
    }

    private Map<String, Object> buildRunStartedPayload(TestScenario scenario, WireMockRunMetadata wireMockMeta) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", scenario.getName());
        payload.put("scenarioId", scenario.getScenarioId());
        payload.put("dslVersion", scenario.getDslVersion());
        payload.put("stepCount", scenario.getSteps() == null ? 0 : scenario.getSteps().size());
        payload.put("tags", scenario.getTags() == null ? List.of() : scenario.getTags());
        payload.put("stepIds", scenario.getSteps() == null
                ? List.of()
                : scenario.getSteps().stream().map(ScenarioStep::getId).collect(Collectors.toList()));
        payload.put("dataKeys", scenario.getData() == null ? List.of() : scenario.getData().keySet());
        payload.put("allureResultsDirectory", resultDirAbsolute());
        payload.put("wireMockEnabled", wireMockMeta != null && wireMockMeta.isEnabled());
        payload.put("wireMockBaseUrl", wireMockMeta == null ? "" : wireMockMeta.getBaseUrl());
        payload.put("wireMockStubCount", wireMockMeta == null ? 0 : wireMockMeta.getStubCount());
        return payload;
    }

    private Map<String, Object> buildStepStartedPayload(ScenarioStep step) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", step.getType());
        payload.put("action", step.getAction());
        payload.put("requestMethod", step.getRequest() == null ? "" : String.valueOf(step.getRequest().getOrDefault("method", "")));
        payload.put("requestUrl", step.getRequest() == null ? "" : String.valueOf(step.getRequest().getOrDefault("url", "")));
        payload.put("timeoutMs", step.getTimeoutMs() == null ? 0 : step.getTimeoutMs());
        payload.put("assertionCount", step.getAssertions() == null ? 0 : step.getAssertions().size());
        return payload;
    }

    private Map<String, Object> buildRunCompletedPayload(ScenarioRunResult result, Instant startedAt, Instant endedAt, WireMockRunMetadata wireMockMeta) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("success", result.isSuccess());
        payload.put("failureStepId", result.getFailureStepId() == null ? "" : result.getFailureStepId());
        payload.put("totalSteps", result.getSteps() == null ? 0 : result.getSteps().size());
        payload.put("passedSteps", result.getSteps() == null ? 0 : result.getSteps().stream().filter(StepRunResult::isSuccess).count());
        payload.put("failedSteps", result.getSteps() == null ? 0 : result.getSteps().stream().filter(s -> !s.isSuccess()).count());
        payload.put("startedAt", startedAt.toString());
        payload.put("endedAt", endedAt.toString());
        payload.put("durationMs", durationMs(startedAt, endedAt));
        payload.put("allureResultsDirectory", resultDirAbsolute());
        payload.put("wireMockEnabled", wireMockMeta != null && wireMockMeta.isEnabled());
        payload.put("wireMockBaseUrl", wireMockMeta == null ? "" : wireMockMeta.getBaseUrl());
        payload.put("wireMockStubCount", wireMockMeta == null ? 0 : wireMockMeta.getStubCount());
        return payload;
    }

    private long durationMs(Instant from, Instant to) {
        return Math.max(0L, to.toEpochMilli() - from.toEpochMilli());
    }

    private String resultDirAbsolute() {
        String configured = allureProperties.getResultsDirectory() == null || allureProperties.getResultsDirectory().isBlank()
                ? "allure-results"
                : allureProperties.getResultsDirectory();
        return Path.of(configured).toAbsolutePath().normalize().toString();
    }

    private AllureRunMetadata buildAllureRunMetadata() {
        String results = allureProperties.getResultsDirectory() == null || allureProperties.getResultsDirectory().isBlank()
                ? "allure-results"
                : allureProperties.getResultsDirectory();
        String report = allureProperties.getReportDirectory() == null || allureProperties.getReportDirectory().isBlank()
                ? "allure-report"
                : allureProperties.getReportDirectory();

        Path resultsPath = Path.of(results).toAbsolutePath().normalize();
        Path reportPath = Path.of(report).toAbsolutePath().normalize();

        return AllureRunMetadata.builder()
                .enabled(allureProperties.isEnabled())
                .resultsDirectory(results)
                .resultsDirectoryAbsolute(resultsPath.toString())
                .reportDirectory(report)
                .reportDirectoryAbsolute(reportPath.toString())
                .reportIndexAbsolute(reportPath.resolve("index.html").toString())
                .generateCommand("allure generate " + results + " -o " + report + " --clean")
                .build();
    }
}
