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
import com.github.tomakehurst.wiremock.client.MappingBuilder;
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
import java.util.regex.Matcher;
import java.util.stream.Collectors;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.matching;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
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
                    enrichWireMockSnapshotWithRuntimeRequests(result);
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
            enrichWireMockSnapshotWithRuntimeRequests(result);
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
            Object requestBody = extractRequestBodyExample(reqMap);

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
                    "requestBody", requestBody == null ? Map.of() : requestBody,
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
            Object requestBody = extractRequestBodyExample(reqMap);

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

            MappingBuilder mappingBuilder;
            if (reqMap.get("urlPathPattern") != null) {
                mappingBuilder = request(method, urlPathMatching(normalizedUrl));
            } else if (reqMap.get("urlPattern") != null) {
                mappingBuilder = request(method, urlMatching(normalizedUrl));
            } else if (reqMap.get("urlPath") != null) {
                mappingBuilder = request(method, urlPathEqualTo(normalizedUrl));
            } else {
                mappingBuilder = request(method, urlEqualTo(normalizedUrl));
            }
            mappingBuilder = applyRequestMatchers(mappingBuilder, reqMap);
            Integer priority = parsePriority(firstNonNull(mock.get("priority"), reqMap.get("priority")));
            if (priority != null) {
                mappingBuilder = mappingBuilder.atPriority(priority);
            }
            server.stubFor(mappingBuilder.willReturn(responseBuilder));
            stubCount++;
            registeredMappings.add(Map.of(
                    "method", method,
                    "url", normalizedUrl,
                    "status", status,
                    "requestBody", requestBody == null ? Map.of() : requestBody,
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
        int[] opIndex = {1};
        Map<String, Integer> requestExampleCounter = new LinkedHashMap<>();
        Map<String, Integer> responseExampleCounter = new LinkedHashMap<>();
        for (Map<String, Object> mapping : mappings) {
            String method = String.valueOf(mapping.getOrDefault("method", "GET")).toLowerCase();
            String url = String.valueOf(mapping.getOrDefault("url", "/"));
            String normalizedPath = normalizePath(url);
            int status = parseStatus(mapping.get("status"));
            Object requestBody = mapping.get("requestBody");
            Object responseBody = mapping.get("responseBody");

            @SuppressWarnings("unchecked")
            Map<String, Object> pathItem = (Map<String, Object>) paths.computeIfAbsent(normalizedPath, k -> new LinkedHashMap<>());
            @SuppressWarnings("unchecked")
            Map<String, Object> operation = (Map<String, Object>) pathItem.computeIfAbsent(method, k -> {
                Map<String, Object> op = new LinkedHashMap<>();
                op.put("operationId", "wiremockOp" + (opIndex[0]++));
                op.put("summary", method.toUpperCase() + " " + normalizedPath);
                op.put("responses", new LinkedHashMap<String, Object>());
                return op;
            });

            if (supportsRequestBody(method)) {
                Map<String, Object> requestBodyNode = new LinkedHashMap<>();
                requestBodyNode.put("required", false);
                Map<String, Object> requestContent = new LinkedHashMap<>();
                Map<String, Object> requestMedia = new LinkedHashMap<>();
                String reqKey = method + "#" + normalizedPath;
                int reqIndex = requestExampleCounter.getOrDefault(reqKey, 0) + 1;
                requestExampleCounter.put(reqKey, reqIndex);
                putOpenApiExample(requestMedia, maybeJson(requestBody), "requestExample" + reqIndex);
                requestContent.put("application/json", requestMedia);
                requestBodyNode.put("content", requestContent);
                if (!operation.containsKey("requestBody")) {
                    operation.put("requestBody", requestBodyNode);
                } else {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> existingRequestBody = (Map<String, Object>) operation.get("requestBody");
                    @SuppressWarnings("unchecked")
                    Map<String, Object> existingContent = (Map<String, Object>) existingRequestBody.computeIfAbsent("content", k -> new LinkedHashMap<>());
                    @SuppressWarnings("unchecked")
                    Map<String, Object> existingMedia = (Map<String, Object>) existingContent.computeIfAbsent("application/json", k -> new LinkedHashMap<>());
                    putOpenApiExample(existingMedia, maybeJson(requestBody), "requestExample" + reqIndex);
                }

                // Add real runtime-captured request payloads (if available) as additional examples.
                Object runtimeBodiesRaw = mapping.get("runtimeRequestBodies");
                if (runtimeBodiesRaw instanceof List<?> runtimeBodies && !runtimeBodies.isEmpty()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> existingRequestBody = (Map<String, Object>) operation.get("requestBody");
                    @SuppressWarnings("unchecked")
                    Map<String, Object> existingContent = (Map<String, Object>) existingRequestBody.computeIfAbsent("content", k -> new LinkedHashMap<>());
                    @SuppressWarnings("unchecked")
                    Map<String, Object> existingMedia = (Map<String, Object>) existingContent.computeIfAbsent("application/json", k -> new LinkedHashMap<>());
                    for (Object runtimeBody : runtimeBodies) {
                        int nextIdx = requestExampleCounter.getOrDefault(reqKey, 0) + 1;
                        requestExampleCounter.put(reqKey, nextIdx);
                        putOpenApiExample(existingMedia, maybeJson(runtimeBody), "runtimeRequestExample" + nextIdx);
                    }
                }
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> responses = (Map<String, Object>) operation.computeIfAbsent("responses", k -> new LinkedHashMap<>());
            String statusKey = String.valueOf(status);
            @SuppressWarnings("unchecked")
            Map<String, Object> response = (Map<String, Object>) responses.computeIfAbsent(statusKey, k -> {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("description", "Mock response from WireMock stub");
                Map<String, Object> content = new LinkedHashMap<>();
                content.put("application/json", new LinkedHashMap<String, Object>());
                r.put("content", content);
                return r;
            });
            @SuppressWarnings("unchecked")
            Map<String, Object> content = (Map<String, Object>) response.computeIfAbsent("content", k -> new LinkedHashMap<>());
            @SuppressWarnings("unchecked")
            Map<String, Object> appJson = (Map<String, Object>) content.computeIfAbsent("application/json", k -> new LinkedHashMap<>());
            String respKey = method + "#" + normalizedPath + "#" + statusKey;
            int respIndex = responseExampleCounter.getOrDefault(respKey, 0) + 1;
            responseExampleCounter.put(respKey, respIndex);
            Object example = maybeJson(responseBody);
            putOpenApiExample(appJson, example, "responseExample" + respIndex);
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

    @SuppressWarnings("unchecked")
    private void putOpenApiExample(Map<String, Object> mediaNode, Object example, String exampleKey) {
        if (mediaNode == null) return;
        Object candidate = example == null ? Map.of() : example;
        if (!mediaNode.containsKey("example") && !mediaNode.containsKey("examples")) {
            mediaNode.put("example", candidate);
            return;
        }
        Map<String, Object> examples;
        if (mediaNode.containsKey("examples") && mediaNode.get("examples") instanceof Map<?, ?> rawExamples) {
            examples = (Map<String, Object>) rawExamples;
        } else {
            examples = new LinkedHashMap<>();
            if (mediaNode.containsKey("example")) {
                examples.put("example1", Map.of("value", mediaNode.get("example")));
                mediaNode.remove("example");
            }
            mediaNode.put("examples", examples);
        }
        String key = (exampleKey == null || exampleKey.isBlank()) ? "example" + (examples.size() + 1) : exampleKey;
        examples.put(key, Map.of("value", candidate));
    }

    private boolean supportsRequestBody(String method) {
        if (method == null) return false;
        String m = method.toUpperCase();
        return !("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m) || "TRACE".equals(m));
    }

    @SuppressWarnings("unchecked")
    private Object extractRequestBodyExample(Map<String, Object> reqMap) {
        if (reqMap == null || reqMap.isEmpty()) return null;
        Object direct = firstNonNull(
                reqMap.get("jsonBody"),
                reqMap.get("body"),
                reqMap.get("requestBody"),
                reqMap.get("payload")
        );
        if (direct != null) {
            return maybeJson(direct);
        }
        Object bodyPatterns = reqMap.get("bodyPatterns");
        if (bodyPatterns instanceof List<?> patterns) {
            for (Object p : patterns) {
                if (!(p instanceof Map<?, ?> raw)) continue;
                Map<String, Object> map = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : raw.entrySet()) {
                    if (entry.getKey() != null) {
                        map.put(String.valueOf(entry.getKey()), entry.getValue());
                    }
                }
                Object equalToJson = firstNonNull(map.get("equalToJson"), map.get("matchesJson"));
                if (equalToJson != null) {
                    return maybeJson(equalToJson);
                }
            }
            Object generated = buildRequestBodyFromJsonPathPatterns(patterns);
            if (generated != null) {
                return generated;
            }
        }
        return null;
    }

    private Object buildRequestBodyFromJsonPathPatterns(List<?> patterns) {
        if (patterns == null || patterns.isEmpty()) return null;
        Map<String, Object> root = new LinkedHashMap<>();
        int added = 0;
        for (Object p : patterns) {
            if (!(p instanceof Map<?, ?> raw)) continue;
            Object exprRaw = raw.get("matchesJsonPath");
            if (!(exprRaw instanceof String expr)) continue;
            String normalized = expr.trim();
            if (normalized.isBlank() || !normalized.startsWith("$")) continue;
            // strip predicate filters because they are match constraints, not payload structure
            normalized = normalized.replaceAll("\\[\\?\\([^\\]]*\\)\\]", "");
            if ("$".equals(normalized)) continue;
            boolean applied = applyJsonPathSample(root, normalized);
            if (applied) added++;
        }
        return added > 0 ? root : null;
    }

    @SuppressWarnings("unchecked")
    private boolean applyJsonPathSample(Map<String, Object> root, String path) {
        if (root == null || path == null || path.isBlank()) return false;
        String working = path.startsWith("$.") ? path.substring(2) : path.startsWith("$") ? path.substring(1) : path;
        if (working.isBlank()) return false;

        List<String> tokens = new ArrayList<>();
        Matcher m = Pattern.compile("([A-Za-z0-9_\\-]+)|\\[(\\d+)\\]").matcher(working);
        while (m.find()) {
            if (m.group(1) != null) tokens.add(m.group(1));
            else if (m.group(2) != null) tokens.add("[" + m.group(2) + "]");
        }
        if (tokens.isEmpty()) return false;

        Object node = root;
        for (int i = 0; i < tokens.size(); i++) {
            String tok = tokens.get(i);
            boolean last = i == tokens.size() - 1;
            String next = last ? null : tokens.get(i + 1);

            if (tok.startsWith("[") && tok.endsWith("]")) {
                int idx;
                try {
                    idx = Integer.parseInt(tok.substring(1, tok.length() - 1));
                } catch (Exception e) {
                    return false;
                }
                if (!(node instanceof List<?> listNode)) return false;
                List<Object> list = (List<Object>) listNode;
                while (list.size() <= idx) list.add(new LinkedHashMap<String, Object>());
                if (last) {
                    if (list.get(idx) == null || list.get(idx) instanceof Map) {
                        list.set(idx, "sample");
                    }
                    return true;
                }
                Object child = list.get(idx);
                if (next != null && next.startsWith("[")) {
                    if (!(child instanceof List<?>)) {
                        child = new ArrayList<>();
                        list.set(idx, child);
                    }
                } else {
                    if (!(child instanceof Map<?, ?>)) {
                        child = new LinkedHashMap<String, Object>();
                        list.set(idx, child);
                    }
                }
                node = child;
            } else {
                if (!(node instanceof Map<?, ?> mapNode)) return false;
                Map<String, Object> map = (Map<String, Object>) mapNode;
                if (last) {
                    map.putIfAbsent(tok, "sample");
                    return true;
                }
                Object child = map.get(tok);
                if (next != null && next.startsWith("[")) {
                    if (!(child instanceof List<?>)) {
                        child = new ArrayList<>();
                        map.put(tok, child);
                    }
                } else {
                    if (!(child instanceof Map<?, ?>)) {
                        child = new LinkedHashMap<String, Object>();
                        map.put(tok, child);
                    }
                }
                node = child;
            }
        }
        return false;
    }

    private Object firstNonNull(Object... values) {
        if (values == null) return null;
        for (Object value : values) {
            if (value != null) return value;
        }
        return null;
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

    private MappingBuilder applyRequestMatchers(MappingBuilder builder, Map<String, Object> reqMap) {
        if (builder == null || reqMap == null || reqMap.isEmpty()) {
            return builder;
        }

        Map<String, Object> headers = asMap(reqMap.get("headers"));
        if (headers != null && !headers.isEmpty()) {
            for (Map.Entry<String, Object> entry : headers.entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null) continue;
                String headerName = String.valueOf(entry.getKey());
                Object raw = entry.getValue();
                Map<String, Object> patternMap = asMap(raw);
                if (patternMap != null && !patternMap.isEmpty()) {
                    if (patternMap.get("equalTo") != null) {
                        builder = builder.withHeader(headerName, equalTo(String.valueOf(patternMap.get("equalTo"))));
                    } else if (patternMap.get("contains") != null) {
                        builder = builder.withHeader(headerName, containing(String.valueOf(patternMap.get("contains"))));
                    } else if (patternMap.get("matches") != null) {
                        builder = builder.withHeader(headerName, matching(String.valueOf(patternMap.get("matches"))));
                    } else {
                        builder = builder.withHeader(headerName, equalTo(String.valueOf(raw)));
                    }
                } else {
                    builder = builder.withHeader(headerName, equalTo(String.valueOf(raw)));
                }
            }
        }

        Object bodyPatternsRaw = reqMap.get("bodyPatterns");
        if (bodyPatternsRaw instanceof List<?> patterns) {
            for (Object patternObj : patterns) {
                Map<String, Object> pattern = asMap(patternObj);
                if (pattern == null || pattern.isEmpty()) continue;

                Object matchesJsonPathExpr = pattern.get("matchesJsonPath");
                if (matchesJsonPathExpr != null) {
                    String expr = String.valueOf(matchesJsonPathExpr).trim();
                    if (!expr.isBlank()) {
                        if (pattern.get("equalTo") != null) {
                            builder = builder.withRequestBody(matchingJsonPath(expr, equalTo(String.valueOf(pattern.get("equalTo")))));
                        } else {
                            builder = builder.withRequestBody(matchingJsonPath(expr));
                        }
                    }
                    continue;
                }

                Object equalToJsonRaw = pattern.get("equalToJson");
                if (equalToJsonRaw != null) {
                    String json = equalToJsonRaw instanceof String s ? s : toJsonString(equalToJsonRaw);
                    builder = builder.withRequestBody(equalToJson(json, true, true));
                    continue;
                }

                if (pattern.get("equalTo") != null) {
                    builder = builder.withRequestBody(equalTo(String.valueOf(pattern.get("equalTo"))));
                    continue;
                }
                if (pattern.get("contains") != null) {
                    builder = builder.withRequestBody(containing(String.valueOf(pattern.get("contains"))));
                    continue;
                }
                if (pattern.get("matches") != null) {
                    builder = builder.withRequestBody(matching(String.valueOf(pattern.get("matches"))));
                }
            }
        }
        return builder;
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

    @SuppressWarnings("unchecked")
    private void enrichWireMockSnapshotWithRuntimeRequests(ScenarioRunResult result) {
        try {
            if (result == null || result.getWireMock() == null || !result.getWireMock().isEnabled()) return;
            Map<String, Object> snapshot = this.lastWireMockSnapshot;
            if (snapshot == null || !Boolean.TRUE.equals(snapshot.get("enabled"))) return;

            Object mappingsObj = snapshot.get("mappings");
            if (!(mappingsObj instanceof List<?> rawMappings) || rawMappings.isEmpty()) return;

            List<Map<String, Object>> mappings = new ArrayList<>();
            for (Object item : rawMappings) {
                if (item instanceof Map<?, ?> m) {
                    Map<String, Object> copy = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> e : m.entrySet()) {
                        if (e.getKey() != null) copy.put(String.valueOf(e.getKey()), e.getValue());
                    }
                    mappings.add(copy);
                }
            }
            if (mappings.isEmpty()) return;

            for (StepRunResult step : result.getSteps()) {
                if (step == null) continue;
                if (!"api-call".equals(step.getStepType()) && !"api-assert".equals(step.getStepType())) continue;
                if (!(step.getOutput() instanceof Map<?, ?> rawOut)) continue;

                Map<String, Object> out = new LinkedHashMap<>();
                for (Map.Entry<?, ?> e : rawOut.entrySet()) {
                    if (e.getKey() != null) out.put(String.valueOf(e.getKey()), e.getValue());
                }

                String method = String.valueOf(out.getOrDefault("method", "")).toUpperCase();
                String url = normalizePath(String.valueOf(out.getOrDefault("url", "/")));
                Object runtimeRequestBody = maybeJson(out.get("requestBody"));
                if (runtimeRequestBody == null || (runtimeRequestBody instanceof Map<?, ?> rb && rb.isEmpty())) continue;

                for (Map<String, Object> mapping : mappings) {
                    String mMethod = String.valueOf(mapping.getOrDefault("method", "")).toUpperCase();
                    String mUrl = normalizePath(String.valueOf(mapping.getOrDefault("url", "/")));
                    if (!method.equals(mMethod) || !url.equals(mUrl)) continue;

                    @SuppressWarnings("unchecked")
                    List<Object> runtimeBodies = (List<Object>) mapping.computeIfAbsent("runtimeRequestBodies", k -> new ArrayList<>());
                    String runtimeBodyCanonical = toJsonString(runtimeRequestBody);
                    boolean exists = runtimeBodies.stream()
                            .map(this::toJsonString)
                            .anyMatch(runtimeBodyCanonical::equals);
                    if (!exists) {
                        runtimeBodies.add(runtimeRequestBody);
                    }

                    Object existing = mapping.get("requestBody");
                    boolean shouldSet = existing == null
                            || (existing instanceof Map<?, ?> em && em.isEmpty())
                            || (existing instanceof String es && es.isBlank());
                    if (shouldSet) {
                        mapping.put("requestBody", runtimeRequestBody);
                    }
                }
            }

            String scenarioId = String.valueOf(snapshot.getOrDefault("scenarioId", result.getScenarioId() == null ? "" : result.getScenarioId()));
            String baseUrl = String.valueOf(snapshot.getOrDefault("baseUrl", result.getWireMock().getBaseUrl() == null ? "" : result.getWireMock().getBaseUrl()));
            Map<String, Object> updated = new LinkedHashMap<>(snapshot);
            updated.put("mappings", mappings);
            updated.put("openapi", buildOpenApiFromMappings(scenarioId, baseUrl, mappings));
            updated.put("generatedAt", Instant.now().toString());
            this.lastWireMockSnapshot = updated;
        } catch (Exception ignored) {
            // best-effort enrichment
        }
    }

    private int parseStatus(Object value) {
        if (value == null) return 200;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return 200;
        }
    }

    private Integer parsePriority(Object value) {
        if (value == null) return null;
        try {
            int n = Integer.parseInt(String.valueOf(value));
            return n > 0 ? n : null;
        } catch (Exception ignored) {
            return null;
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
