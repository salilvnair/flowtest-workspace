package com.salilvnair.flowtest.engine.api;

import com.salilvnair.flowtest.ai.spi.AiTaskType;
import lombok.Data;

import java.util.Map;

@Data
public class AiTaskRequest {
    private AiTaskType taskType;
    private String prompt;
    private Map<String, Object> context;
}
