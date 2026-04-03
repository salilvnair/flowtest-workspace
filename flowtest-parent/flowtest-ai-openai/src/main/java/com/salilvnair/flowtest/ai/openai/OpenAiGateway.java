package com.salilvnair.flowtest.ai.openai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salilvnair.flowtest.ai.spi.AiGateway;
import com.salilvnair.flowtest.ai.spi.AiRequest;
import com.salilvnair.flowtest.ai.spi.AiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class OpenAiGateway implements AiGateway {

    private final OpenAiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient = RestClient.builder().build();

    @Override
    public String providerId() {
        return "openai";
    }

    @Override
    public boolean available() {
        return properties.isEnabled() && properties.getApiKey() != null && !properties.getApiKey().isBlank();
    }

    @Override
    public AiResponse execute(AiRequest request) {
        if (!available()) {
            return AiResponse.error(providerId(), "OpenAI gateway is not enabled or key is missing");
        }

        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("model", properties.getModel());
            payload.put("input", request.prompt());

            String raw = restClient.post()
                    .uri(properties.getEndpoint())
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + properties.getApiKey())
                    .body(payload)
                    .retrieve()
                    .body(String.class);

            JsonNode root = objectMapper.readTree(raw);
            String content = root.path("output_text").asText("");

            if (content.isBlank()) {
                content = raw;
            }
            return AiResponse.ok(content, providerId());
        } catch (Exception e) {
            return AiResponse.error(providerId(), e.getMessage());
        }
    }
}
