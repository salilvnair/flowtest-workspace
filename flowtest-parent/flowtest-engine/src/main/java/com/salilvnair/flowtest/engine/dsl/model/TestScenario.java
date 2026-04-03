package com.salilvnair.flowtest.engine.dsl.model;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class TestScenario {
    private String dslVersion;
    private String scenarioId;
    private String name;
    private List<String> tags;
    private ScenarioConfig config;
    private Map<String, Object> data;
    private List<Map<String, Object>> mocks;
    private List<ScenarioStep> steps;
    private List<Map<String, Object>> cleanup;
}
