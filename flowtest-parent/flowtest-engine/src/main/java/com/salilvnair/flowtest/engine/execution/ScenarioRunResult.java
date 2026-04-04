package com.salilvnair.flowtest.engine.execution;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class ScenarioRunResult {
    private String scenarioId;
    private String scenarioName;
    private boolean success;
    private String failureStepId;
    private int inputMocksCount;
    private long inlineMockStepCount;
    private AllureRunMetadata allure;
    private WireMockRunMetadata wireMock;
    private List<StepRunResult> steps = new ArrayList<>();
}
