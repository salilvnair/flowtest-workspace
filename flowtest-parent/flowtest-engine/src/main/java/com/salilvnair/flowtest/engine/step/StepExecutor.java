package com.salilvnair.flowtest.engine.step;

import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.execution.ExecutionContext;
import com.salilvnair.flowtest.engine.execution.StepRunResult;

public interface StepExecutor {
    boolean supports(String stepType);
    StepRunResult execute(ScenarioStep step, ExecutionContext context);
}
