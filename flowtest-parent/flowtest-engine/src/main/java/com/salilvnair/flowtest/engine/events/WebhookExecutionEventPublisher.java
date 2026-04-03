package com.salilvnair.flowtest.engine.events;

import com.salilvnair.flowtest.engine.config.FlowTestEventCallbackProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@RequiredArgsConstructor
public class WebhookExecutionEventPublisher implements ExecutionEventPublisher {

    private final FlowTestEventCallbackProperties properties;
    private final RestClient restClient = RestClient.builder().build();

    @Override
    public void publish(ExecutionEvent event) {
        if (!properties.isWebhookEnabled() || properties.getWebhookUrl() == null || properties.getWebhookUrl().isBlank()) {
            return;
        }

        RestClient.RequestBodySpec spec = restClient.post()
                .uri(properties.getWebhookUrl())
                .contentType(MediaType.APPLICATION_JSON);

        if (properties.getAuthToken() != null && !properties.getAuthToken().isBlank()) {
            spec = spec.header("Authorization", "Bearer " + properties.getAuthToken());
        }

        spec.body(event).retrieve().toBodilessEntity();
    }
}
