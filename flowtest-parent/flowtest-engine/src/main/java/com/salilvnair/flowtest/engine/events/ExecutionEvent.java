package com.salilvnair.flowtest.engine.events;

import java.time.Instant;
import java.util.Map;

public record ExecutionEvent(
        ExecutionEventType type,
        String scenarioId,
        String stepId,
        Instant at,
        Map<String, Object> payload
) {
}
