package com.salilvnair.flowtest.ai.spi;

import java.util.Map;

public record AiResponse(boolean success, String content, String provider, Map<String, Object> metadata, String errorMessage) {

    public static AiResponse ok(String content, String provider) {
        return new AiResponse(true, content, provider, Map.of(), null);
    }

    public static AiResponse error(String provider, String errorMessage) {
        return new AiResponse(false, null, provider, Map.of(), errorMessage);
    }
}
