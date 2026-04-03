package com.salilvnair.flowtest.ai.spi;

public interface AiGateway {
    String providerId();
    boolean available();
    AiResponse execute(AiRequest request);
}
