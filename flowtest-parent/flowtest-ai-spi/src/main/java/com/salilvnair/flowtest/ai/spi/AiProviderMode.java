package com.salilvnair.flowtest.ai.spi;

public enum AiProviderMode {
    OPENAI,
    COPILOT,
    AUTO,
    NONE;

    public static AiProviderMode from(String raw) {
        if (raw == null || raw.isBlank()) {
            return AUTO;
        }
        return AiProviderMode.valueOf(raw.trim().toUpperCase());
    }
}
