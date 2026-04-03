package com.salilvnair.flowtest.ai.external;

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
public class CopilotGateway implements AiGateway {

    private final ExternalAiProperties properties;
    private final RestClient restClient = RestClient.builder().build();

    @Override
    public String providerId() {
        return "copilot";
    }

    @Override
    public boolean available() {
        return properties.isEnabled() && properties.getEndpoint() != null && !properties.getEndpoint().isBlank();
    }

    @Override
    public AiResponse execute(AiRequest request) {
        if (!available()) {
            return AiResponse.error(providerId(), "Copilot bridge is not enabled");
        }

        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("taskType", request.taskType().name());
            payload.put("prompt", request.prompt());
            payload.put("context", request.context());

            RestClient.RequestBodySpec spec = restClient.post()
                    .uri(properties.getEndpoint())
                    .contentType(MediaType.APPLICATION_JSON);

            if (properties.getAuthToken() != null && !properties.getAuthToken().isBlank()) {
                spec = spec.header("Authorization", "Bearer " + properties.getAuthToken());
            }

            String raw = spec.body(payload)
                    .retrieve()
                    .body(String.class);

            return AiResponse.ok(raw, providerId());
        } catch (Exception e) {
            return AiResponse.error(providerId(), e.getMessage());
        }
    }
}
