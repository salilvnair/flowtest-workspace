package com.salilvnair.flowtest.engine.step.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.Map;

@Component
@Order(20)
@RequiredArgsConstructor
public class ApiCallStepExecutor implements StepExecutor {

    private static final String CONTEXT_BASE_URL = "__flowtest_base_url";
    private static final String CONTEXT_WIREMOCK_ENABLED = "__flowtest_wiremock_enabled";

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
            Map<String, Object> request = step.getRequest();
            String method = String.valueOf(request.get("method"));
            String rawUrl = String.valueOf(request.get("url"));
            String url = resolveUrl(rawUrl, context);

            boolean wiremockEnabled = Boolean.TRUE.equals(context.get(CONTEXT_WIREMOCK_ENABLED));
            Object mockResponse = request.get("_flowtestMockResponse");
            if (!wiremockEnabled && mockResponse != null) {
                String responseBody = stringify(mockResponse);
                Map<String, Object> output = new LinkedHashMap<>();
                output.put("mode", "inline-mock-fallback");
                output.put("method", method);
                output.put("url", url);
                output.put("status", parseStatus(request.get("_flowtestMockStatus")));
                output.put("responseBody", responseBody);
                context.putStepOutput(step.getId(), output);
                result.setOutput(output);
                result.setSuccess(true);
                return result;
            }

            ResponseEntity<String> response = restClient.method(HttpMethod.valueOf(method))
                    .uri(url)
                    .retrieve()
                    .toEntity(String.class);

            Map<String, Object> output = new LinkedHashMap<>();
            output.put("mode", wiremockEnabled ? "wiremock" : "live-api");
            output.put("method", method);
            output.put("url", url);
            output.put("status", response.getStatusCode().value());
            output.put("responseBody", response.getBody() == null ? "" : response.getBody());

            context.putStepOutput(step.getId(), output);
            result.setOutput(output);
            result.setSuccess(true);
            return result;
        } catch (RestClientResponseException re) {
            result.setSuccess(false);
            result.setErrorMessage(re.getMessage());
            Map<String, Object> output = new LinkedHashMap<>();
            output.put("status", re.getStatusCode() == null ? 0 : re.getStatusCode().value());
            output.put("responseBody", re.getResponseBodyAsString());
            output.put("headers", re.getResponseHeaders() == null ? Map.of() : re.getResponseHeaders().toSingleValueMap());
            result.setOutput(output);
            return result;
        } catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
            return result;
        }
    }

    private String resolveUrl(String rawUrl, ExecutionContext context) {
        if (rawUrl == null) return "";
        String u = rawUrl.trim();
        if (u.startsWith("http://") || u.startsWith("https://")) {
            return u;
        }
        if (!u.startsWith("/")) {
            u = "/" + u;
        }
        String overrideBase = String.valueOf(context.get(CONTEXT_BASE_URL));
        String base = (overrideBase == null || overrideBase.isBlank() || "null".equalsIgnoreCase(overrideBase))
                ? executionBaseUrl
                : overrideBase;
        return base.replaceAll("/+$", "") + u;
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
}
