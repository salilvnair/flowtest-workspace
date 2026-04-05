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
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.request;
import static com.github.tomakehurst.wiremock.client.WireMock.urlMatching;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;

@Service
@Slf4j
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
        result.setInputMocksCount(scenario.getMocks() == null ? 0 : scenario.getMocks().size());
        result.setInlineMockStepCount(scenario.getSteps() == null
                ? 0L
                : scenario.getSteps().stream()
                .filter(step -> step != null && step.getRequest() != null && step.getRequest().get("_flowtestMockResponse") != null)
                .count());
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
    private volatile Map<String, Object> lastWireMockSnapshot = Map.of(
            "enabled", false,
            "message", "WireMock has not been initialized yet"
    );

    public Map<String, Object> getLastWireMockSnapshot() {
        return lastWireMockSnapshot;
    }

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
            this.lastWireMockSnapshot = Map.of(
                    "enabled", false,
                    "scenarioId", scenario.getScenarioId() == null ? "" : scenario.getScenarioId(),
                    "message", "No API steps or top-level mocks found"
            );
            return WireMockRunMetadata.builder().enabled(false).stubCount(0).build();
        }

        WireMockServer server = new WireMockServer(options().dynamicPort());
        server.start();
        int stubCount = 0;
        List<Map<String, Object>> registeredMappings = new ArrayList<>();

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
            registeredMappings.add(Map.of(
                    "method", method,
                    "url", path,
                    "status", status,
                    "responseBody", mockResponse
            ));
        }

        // Also support top-level DSL mocks: { request: { method, url }, response: { status, jsonBody/body, headers } }
        for (Map<String, Object> mock : scenarioMocks) {
            Map<String, Object> reqMap = asMap(mock.get("request"));
            if (reqMap == null) {
                continue;
            }
            String method = String.valueOf(reqMap.getOrDefault("method", "GET")).toUpperCase();
            String url = firstNonBlank(
                    reqMap.get("url"),
                    reqMap.get("urlPath"),
                    reqMap.get("urlPattern"),
                    reqMap.get("urlPathPattern")
            );
            if (url == null) {
                url = "/";
            }
            String normalizedUrl = normalizePath(url);

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

            if (reqMap.get("urlPathPattern") != null) {
                server.stubFor(request(method, urlPathMatching(normalizedUrl)).willReturn(responseBuilder));
            } else if (reqMap.get("urlPattern") != null) {
                server.stubFor(request(method, urlMatching(normalizedUrl)).willReturn(responseBuilder));
            } else if (reqMap.get("urlPath") != null) {
                server.stubFor(request(method, urlPathEqualTo(normalizedUrl)).willReturn(responseBuilder));
            } else {
                server.stubFor(request(method, urlEqualTo(normalizedUrl)).willReturn(responseBuilder));
            }
            stubCount++;
            registeredMappings.add(Map.of(
                    "method", method,
                    "url", normalizedUrl,
                    "status", status,
                    "responseBody", bodyValue == null ? Map.of() : bodyValue
            ));
        }

        if (stubCount == 0) {
            log.info("flowtest-wiremock bootstrap=no-stubs scenarioId={} apiSteps={} scenarioMocks={}",
                    scenario.getScenarioId(),
                    apiSteps.size(),
                    scenarioMocks.size());
            server.stop();
            this.lastWireMockSnapshot = Map.of(
                    "enabled", false,
                    "scenarioId", scenario.getScenarioId() == null ? "" : scenario.getScenarioId(),
                    "message", "WireMock started but no valid stubs could be registered"
            );
            return WireMockRunMetadata.builder().enabled(false).stubCount(0).build();
        }

        this.activeWireMock = server;
        String baseUrl = "http://localhost:" + server.port();
        this.lastWireMockSnapshot = buildWireMockSnapshot(
                scenario.getScenarioId(),
                baseUrl,
                registeredMappings
        );
        log.info("flowtest-wiremock bootstrap=enabled scenarioId={} stubCount={} port={}",
                scenario.getScenarioId(), stubCount, server.port());
        return WireMockRunMetadata.builder()
                .enabled(true)
                .baseUrl(baseUrl)
                .port(server.port())
                .stubCount(stubCount)
                .build();
    }

    private Map<String, Object> buildWireMockSnapshot(
            String scenarioId,
            String baseUrl,
            List<Map<String, Object>> mappings
    ) {
        List<Map<String, Object>> sorted = mappings.stream()
                .sorted(Comparator.comparing(m -> String.valueOf(m.getOrDefault("url", "")) + "#" + String.valueOf(m.getOrDefault("method", ""))))
                .toList();

        Map<String, Object> openapi = buildOpenApiFromMappings(scenarioId, baseUrl, sorted);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("enabled", true);
        snapshot.put("scenarioId", scenarioId == null ? "" : scenarioId);
        snapshot.put("baseUrl", baseUrl);
        snapshot.put("adminMappingsUrl", baseUrl + "/__admin/mappings");
        snapshot.put("generatedAt", Instant.now().toString());
        snapshot.put("stubCount", sorted.size());
        snapshot.put("mappings", sorted);
        snapshot.put("openapi", openapi);
        return snapshot;
    }

    private Map<String, Object> buildOpenApiFromMappings(
            String scenarioId,
            String baseUrl,
            List<Map<String, Object>> mappings
    ) {
        Map<String, Object> paths = new LinkedHashMap<>();
        int opIndex = 1;
        for (Map<String, Object> mapping : mappings) {
            String method = String.valueOf(mapping.getOrDefault("method", "GET")).toLowerCase();
            String url = String.valueOf(mapping.getOrDefault("url", "/"));
            String normalizedPath = normalizePath(url);
            int status = parseStatus(mapping.get("status"));
            Object responseBody = mapping.get("responseBody");

            @SuppressWarnings("unchecked")
            Map<String, Object> pathItem = (Map<String, Object>) paths.computeIfAbsent(normalizedPath, k -> new LinkedHashMap<>());
            Map<String, Object> operation = new LinkedHashMap<>();
            operation.put("operationId", "wiremockOp" + (opIndex++));
            operation.put("summary", method.toUpperCase() + " " + normalizedPath);

            Map<String, Object> responses = new LinkedHashMap<>();
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("description", "Mock response from WireMock stub");

            Map<String, Object> media = new LinkedHashMap<>();
            Map<String, Object> appJson = new LinkedHashMap<>();
            Object example = maybeJson(responseBody);
            appJson.put("example", example);
            media.put("application/json", appJson);
            response.put("content", media);
            responses.put(String.valueOf(status), response);

            operation.put("responses", responses);
            pathItem.put(method, operation);
        }

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("title", "FlowTest WireMock Runtime API");
        info.put("version", "1.0.0");
        info.put("description", "OpenAPI generated from active WireMock mappings for scenario " + (scenarioId == null ? "" : scenarioId));

        Map<String, Object> server = new LinkedHashMap<>();
        server.put("url", baseUrl);
        server.put("description", "Active WireMock runtime");

        Map<String, Object> openapi = new LinkedHashMap<>();
        openapi.put("openapi", "3.0.3");
        openapi.put("info", info);
        openapi.put("servers", List.of(server));
        openapi.put("paths", paths);
        return openapi;
    }

    private Object maybeJson(Object value) {
        if (value == null) return Map.of();
        if (value instanceof String s) {
            String t = s.trim();
            if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
                try {
                    return objectMapper.readValue(t, Object.class);
                } catch (Exception ignored) {
                    return s;
                }
            }
            return s;
        }
        return value;
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

    private String firstNonBlank(Object... values) {
        if (values == null) return null;
        for (Object value : values) {
            if (value == null) continue;
            String s = String.valueOf(value).trim();
            if (!s.isBlank() && !"null".equalsIgnoreCase(s)) {
                return s;
            }
        }
        return null;
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
        payload.put("inputMocksCount", scenario.getMocks() == null ? 0 : scenario.getMocks().size());
        payload.put("inlineMockStepCount", scenario.getSteps() == null
                ? 0
                : scenario.getSteps().stream()
                .filter(step -> step != null && step.getRequest() != null && step.getRequest().get("_flowtestMockResponse") != null)
                .count());
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
