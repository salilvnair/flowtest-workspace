package com.salilvnair.flowtest.engine.execution;

import java.util.HashMap;
import java.util.Map;

public class ExecutionContext {
    private final Map<String, Object> data = new HashMap<>();
    private final Map<String, Object> stepOutputs = new HashMap<>();

    public void put(String key, Object value) {
        data.put(key, value);
    }

    public Object get(String key) {
        return data.get(key);
    }

    public void putStepOutput(String stepId, Object value) {
        stepOutputs.put(stepId, value);
    }
}
