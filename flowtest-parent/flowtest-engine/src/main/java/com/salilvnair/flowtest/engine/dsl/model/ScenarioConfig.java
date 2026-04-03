package com.salilvnair.flowtest.engine.dsl.model;

import lombok.Data;

@Data
public class ScenarioConfig {
    private String baseUrl;
    private String uiBaseUrl;
    private Long timeoutMs;
    private Long pollIntervalMs;
}
