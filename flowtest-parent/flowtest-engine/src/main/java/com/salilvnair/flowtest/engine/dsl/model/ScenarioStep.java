package com.salilvnair.flowtest.engine.dsl.model;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class ScenarioStep {
    private String id;
    private String type;
    private String action;
    private String page;
    private Map<String, Object> input;
    private Map<String, Object> request;
    private List<AssertionDefinition> assertions;
    private Map<String, String> save;
    private String sql;
    private List<Object> params;
    private Long timeoutMs;
    private Long pollIntervalMs;
    private Map<String, Object> until;
    private String function;
}
