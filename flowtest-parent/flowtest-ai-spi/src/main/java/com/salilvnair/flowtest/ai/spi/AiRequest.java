package com.salilvnair.flowtest.ai.spi;

import java.util.Map;

public record AiRequest(AiTaskType taskType, String prompt, Map<String, Object> context) {
}
