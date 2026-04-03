package com.salilvnair.flowtest.engine.step;

import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.execution.ExecutionContext;
import com.salilvnair.flowtest.engine.execution.StepRunResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class StepDispatcher {

    private final List<StepExecutor> executors;

    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        return executors.stream()
                .filter(executor -> executor.supports(step.getType()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No step executor for type: " + step.getType()))
                .execute(step, context);
    }
}
