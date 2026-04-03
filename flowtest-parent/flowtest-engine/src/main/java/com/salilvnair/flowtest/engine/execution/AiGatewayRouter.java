package com.salilvnair.flowtest.engine.execution;

import com.salilvnair.flowtest.ai.spi.AiGateway;
import com.salilvnair.flowtest.ai.spi.AiProviderMode;
import com.salilvnair.flowtest.engine.config.FlowTestAiProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class AiGatewayRouter {

    private final List<AiGateway> gateways;
    private final FlowTestAiProperties properties;

    public AiGateway resolve() {
        AiProviderMode mode = AiProviderMode.from(properties.getMode());

        return switch (mode) {
            case OPENAI -> gatewayById("openai");
            case COPILOT -> gatewayById("copilot");
            case AUTO -> gateways.stream().filter(AiGateway::available).findFirst()
                    .orElseThrow(() -> new IllegalStateException("No available AI gateway"));
            case NONE -> throw new IllegalStateException("AI mode is NONE. External orchestrator must supply artifacts.");
        };
    }

    private AiGateway gatewayById(String providerId) {
        return gateways.stream()
                .filter(g -> g.providerId().toLowerCase(Locale.ROOT).equals(providerId.toLowerCase(Locale.ROOT)))
                .filter(AiGateway::available)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No available AI gateway for provider: " + providerId));
    }
}
