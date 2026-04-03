package com.salilvnair.flowtest.engine.step.impl;

import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.execution.ExecutionContext;
import com.salilvnair.flowtest.engine.execution.StepRunResult;
import com.salilvnair.flowtest.engine.step.StepExecutor;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(1000)
public class UnsupportedStepExecutor implements StepExecutor {
    @Override
    public boolean supports(String stepType) {
        return true;
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = StepRunResult.builder()
                .stepId(step.getId())
                .stepType(step.getType())
                .build();
        result.setSuccess(false);
        result.setErrorMessage("Unsupported step type: " + step.getType());
        return result;
    }
}
