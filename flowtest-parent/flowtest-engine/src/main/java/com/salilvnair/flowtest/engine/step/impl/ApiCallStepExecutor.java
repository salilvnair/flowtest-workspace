package com.salilvnair.flowtest.engine.step.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salilvnair.flowtest.engine.dsl.model.AssertionDefinition;
import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.execution.ExecutionContext;
import com.salilvnair.flowtest.engine.execution.StepRunResult;
import com.salilvnair.flowtest.engine.step.StepExecutor;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Component
@Order(20)
@RequiredArgsConstructor
public class ApiCallStepExecutor implements StepExecutor {

    private static final String CONTEXT_BASE_URL = "__flowtest_base_url";
    private static final String CONTEXT_WIREMOCK_ENABLED = "__flowtest_wiremock_enabled";
    private static final String CONTEXT_LAST_API_OUTPUT = "__flowtest_last_api_output";
    private static final String CONTEXT_LAST_API_STEP_ID = "__flowtest_last_api_step_id";
    private static final Pattern BASE_URL_TEMPLATE = Pattern.compile("\\{\\{\\s*baseUrl\\s*\\}\\}", Pattern.CASE_INSENSITIVE);

    private final RestClient.Builder builder;
    private final ObjectMapper objectMapper;
    @Value("${flowtest.execution.base-url:http://localhost:8080}")
    private String executionBaseUrl;
    private RestClient restClient;

    @PostConstruct
    void init() {
        restClient = builder.build();
    }

    @Override
    public boolean supports(String stepType) {
        return "api-call".equals(stepType) || "api-assert".equals(stepType);
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = StepRunResult.builder()
                .stepId(step.getId())
                .stepType(step.getType())
                .build();

        try {
            if ("api-assert".equals(step.getType())) {
                StepRunResult assertResult = evaluateApiAssert(step, context);
                if (assertResult != null) {
                    return assertResult;
                }
            }

            Map<String, Object> request = step.getRequest();
            String method = String.valueOf(request.get("method"));
            String rawUrl = String.valueOf(request.get("url"));
            String url = resolveUrl(rawUrl, context);
            Object requestBody = extractRequestBodyExample(request);

            boolean wiremockEnabled = Boolean.TRUE.equals(context.get(CONTEXT_WIREMOCK_ENABLED));
            Object mockResponse = request.get("_flowtestMockResponse");
            if (!wiremockEnabled && mockResponse != null) {
                String responseBody = stringify(mockResponse);
                Map<String, Object> output = new LinkedHashMap<>();
                output.put("mode", "inline-mock-fallback");
                output.put("selfHealApplied", false);
                output.put("method", method);
                output.put("url", url);
                output.put("requestBody", requestBody == null ? Map.of() : requestBody);
                output.put("status", parseStatus(request.get("_flowtestMockStatus")));
                output.put("responseBody", responseBody);
                context.putStepOutput(step.getId(), output);
                result.setOutput(output);
                result.setSuccess(true);
                return result;
            }

            var requestSpec = restClient.method(HttpMethod.valueOf(method))
                    .uri(url);
            if (supportsRequestBody(method) && requestBody != null) {
                requestSpec.body(requestBody);
            }
            ResponseEntity<String> response = requestSpec
                    .retrieve()
                    .toEntity(String.class);

            Map<String, Object> output = new LinkedHashMap<>();
            output.put("mode", wiremockEnabled ? "wiremock" : "live-api");
            output.put("selfHealApplied", false);
            output.put("method", method);
            output.put("url", url);
            output.put("requestBody", requestBody == null ? Map.of() : requestBody);
            output.put("status", response.getStatusCode().value());
            output.put("responseBody", response.getBody() == null ? "" : response.getBody());

            context.putStepOutput(step.getId(), output);
            context.put(CONTEXT_LAST_API_OUTPUT, output);
            context.put(CONTEXT_LAST_API_STEP_ID, step.getId());
            result.setOutput(output);
            result.setSuccess(true);
            return result;
        } catch (RestClientResponseException re) {
            Map<String, Object> output = new LinkedHashMap<>();
            Map<String, Object> request = step.getRequest() == null ? Map.of() : step.getRequest();
            String method = String.valueOf(request.getOrDefault("method", ""));
            String rawUrl = String.valueOf(request.getOrDefault("url", ""));
            String url = resolveUrl(rawUrl, context);
            Object requestBody = extractRequestBodyExample(request);
            int actualStatus = re.getStatusCode() == null ? 0 : re.getStatusCode().value();
            output.put("method", method);
            output.put("url", url);
            output.put("requestBody", requestBody == null ? Map.of() : requestBody);
            output.put("status", actualStatus);
            output.put("responseBody", re.getResponseBodyAsString());
            output.put("headers", re.getResponseHeaders() == null ? Map.of() : re.getResponseHeaders().toSingleValueMap());
            output.put("selfHealApplied", false);

            // api-call is execution-only: capture HTTP outcome and continue.
            // Assertions should be done in api-assert steps.
            if ("api-call".equals(step.getType())) {
                context.putStepOutput(step.getId(), output);
                context.put(CONTEXT_LAST_API_OUTPUT, output);
                context.put(CONTEXT_LAST_API_STEP_ID, step.getId());
                result.setOutput(output);
                result.setSuccess(true);
                return result;
            }

            if (isExpectedHttpStatus(step, request, actualStatus)) {
                context.putStepOutput(step.getId(), output);
                context.put(CONTEXT_LAST_API_OUTPUT, output);
                context.put(CONTEXT_LAST_API_STEP_ID, step.getId());
                result.setOutput(output);
                result.setSuccess(true);
                return result;
            }

            result.setSuccess(false);
            result.setErrorMessage(re.getMessage());
            result.setOutput(output);
            return result;
        } catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            return result;
        }
    }

    @SuppressWarnings("unchecked")
    private StepRunResult evaluateApiAssert(ScenarioStep step, ExecutionContext context) {
        Object previousOutputObj = context.get(CONTEXT_LAST_API_OUTPUT);
        if (!(previousOutputObj instanceof Map<?, ?> previousRaw)) {
            return null;
        }

        Map<String, Object> previousOutput = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : previousRaw.entrySet()) {
            if (entry.getKey() != null) {
                previousOutput.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }

        int actualStatus = parseActualStatus(previousOutput.get("status"));
        Map<String, Object> request = step.getRequest() == null ? Map.of() : step.getRequest();
        if (!isExpectedHttpStatus(step, request, actualStatus)) {
            Set<String> expectedSpecs = collectExpectedStatusSpecs(step, request);
            if (!expectedSpecs.isEmpty()) {
                StepRunResult failed = StepRunResult.builder()
                        .stepId(step.getId())
                        .stepType(step.getType())
                        .build();
                failed.setSuccess(false);
                failed.setErrorMessage("Status assertion failed. expected=" + String.join(",", expectedSpecs) + " actual=" + actualStatus);
                failed.setOutput(previousOutput);
                return failed;
            }
        }

        Map<String, Object> assertOutput = new LinkedHashMap<>(previousOutput);
        assertOutput.put("mode", "assert-from-context");
        assertOutput.put("selfHealApplied", true);
        assertOutput.put("selfHealType", "api-assert-from-context");
        assertOutput.put("assertedFromStepId", String.valueOf(context.get(CONTEXT_LAST_API_STEP_ID)));
        context.putStepOutput(step.getId(), assertOutput);

        StepRunResult passed = StepRunResult.builder()
                .stepId(step.getId())
                .stepType(step.getType())
                .build();
        passed.setSuccess(true);
        passed.setOutput(assertOutput);
        return passed;
    }

    private String resolveUrl(String rawUrl, ExecutionContext context) {
        if (rawUrl == null) return "";
        String overrideBase = String.valueOf(context.get(CONTEXT_BASE_URL));
        String base = (overrideBase == null || overrideBase.isBlank() || "null".equalsIgnoreCase(overrideBase))
                ? executionBaseUrl
                : overrideBase;
        String normalizedBase = base.replaceAll("/+$", "");
        String u = BASE_URL_TEMPLATE.matcher(rawUrl.trim()).replaceAll(normalizedBase);
        if (u.startsWith("http://") || u.startsWith("https://")) {
            return u;
        }
        if (!u.startsWith("/")) {
            u = "/" + u;
        }
        return normalizedBase + u;
    }

    private int parseStatus(Object value) {
        if (value == null) return 200;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return 200;
        }
    }

    private String stringify(Object payload) {
        if (payload == null) return "";
        if (payload instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ignored) {
            return String.valueOf(payload);
        }
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
        if (bodyPatterns instanceof java.util.List<?> patterns) {
            for (Object p : patterns) {
                if (!(p instanceof Map<?, ?> raw)) continue;
                Map<String, Object> map = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : raw.entrySet()) {
                    if (entry.getKey() != null) {
                        map.put(String.valueOf(entry.getKey()), entry.getValue());
                    }
                }
                Object equalToJson = firstNonNull(map.get("equalToJson"), map.get("matchesJson"));
                if (equalToJson != null) return maybeJson(equalToJson);
            }
        }
        return null;
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

    private boolean isExpectedHttpStatus(ScenarioStep step, Map<String, Object> request, int actualStatus) {
        Set<String> expectedSpecs = collectExpectedStatusSpecs(step, request);
        if (expectedSpecs.isEmpty()) return false;
        for (String spec : expectedSpecs) {
            if (matchesStatusSpec(spec, actualStatus)) return true;
        }
        return false;
    }

    private Set<String> collectExpectedStatusSpecs(ScenarioStep step, Map<String, Object> request) {
        Set<String> expectedSpecs = new LinkedHashSet<>();
        collectExpectedStatusSpecs(expectedSpecs, request == null ? null : request.get("expectedStatus"));
        collectExpectedStatusSpecs(expectedSpecs, request == null ? null : request.get("expectedStatusCode"));
        collectExpectedStatusSpecs(expectedSpecs, request == null ? null : request.get("expectedHttpStatus"));
        collectExpectedStatusSpecs(expectedSpecs, request == null ? null : request.get("expectedStatuses"));
        collectExpectedStatusSpecs(expectedSpecs, request == null ? null : request.get("expectedStatusCodes"));
        collectExpectedStatusSpecs(expectedSpecs, request == null ? null : request.get("_flowtestMockStatus"));

        List<AssertionDefinition> assertions = step == null ? null : step.getAssertions();
        if (assertions != null) {
            for (AssertionDefinition assertion : assertions) {
                if (assertion == null) continue;
                String type = String.valueOf(assertion.getType() == null ? "" : assertion.getType()).toLowerCase();
                String path = String.valueOf(assertion.getPath() == null ? "" : assertion.getPath()).toLowerCase();
                boolean statusAssertion = type.contains("status")
                        || "status".equals(path)
                        || "$.statusCode".equals(path)
                        || "statusCode".equals(path);
                if (statusAssertion) {
                    collectExpectedStatusSpecs(expectedSpecs, assertion.getExpected());
                }
            }
        }
        return expectedSpecs;
    }

    private void collectExpectedStatusSpecs(Set<String> out, Object value) {
        if (out == null || value == null) return;
        if (value instanceof Number n) {
            out.add(String.valueOf(n.intValue()));
            return;
        }
        if (value instanceof String s) {
            String t = s.trim();
            if (t.isBlank()) return;
            if (t.contains(",")) {
                for (String part : t.split(",")) {
                    String p = part.trim();
                    if (!p.isBlank()) out.add(p);
                }
                return;
            }
            out.add(t);
            return;
        }
        if (value instanceof List<?> list) {
            for (Object item : list) {
                collectExpectedStatusSpecs(out, item);
            }
        }
    }

    private boolean matchesStatusSpec(String spec, int status) {
        if (spec == null) return false;
        String s = spec.trim().toLowerCase();
        if (s.isBlank()) return false;
        if (s.matches("[1-5]xx")) {
            int bucket = Character.digit(s.charAt(0), 10);
            return status >= bucket * 100 && status < (bucket + 1) * 100;
        }
        try {
            return Integer.parseInt(s) == status;
        } catch (Exception ignored) {
            return false;
        }
    }

    private int parseActualStatus(Object rawStatus) {
        if (rawStatus == null) return 0;
        if (rawStatus instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(rawStatus));
        } catch (Exception ignored) {
            return 0;
        }
    }
}
