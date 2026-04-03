package com.salilvnair.flowtest.engine.step.impl;

import com.salilvnair.flowtest.engine.dsl.model.ScenarioStep;
import com.salilvnair.flowtest.engine.execution.ExecutionContext;
import com.salilvnair.flowtest.engine.execution.StepRunResult;
import com.salilvnair.flowtest.engine.step.StepExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(10)
public class LogStepExecutor implements StepExecutor {

    private static final Logger log = LoggerFactory.getLogger(LogStepExecutor.class);

    @Override
    public boolean supports(String stepType) {
        return "log".equals(stepType) || "set-context".equals(stepType) || "sleep".equals(stepType);
    }

    @Override
    public StepRunResult execute(ScenarioStep step, ExecutionContext context) {
        StepRunResult result = StepRunResult.builder()
                .stepId(step.getId())
                .stepType(step.getType())
                .build();
        try {
            switch (step.getType()) {
                case "log" -> {
                    Object message = step.getInput() != null ? step.getInput().get("message") : null;
                    log.info("flowtest-step-log id={} message={}", step.getId(), message);
                    result.setOutput(message);
                }
                case "set-context" -> {
                    if (step.getInput() != null) {
                        step.getInput().forEach(context::put);
                    }
                    result.setOutput(step.getInput());
                }
                case "sleep" -> {
                    long ms = 1000;
                    if (step.getInput() != null && step.getInput().get("ms") != null) {
                        ms = Long.parseLong(String.valueOf(step.getInput().get("ms")));
                    }
                    Thread.sleep(ms);
                    result.setOutput("Slept for " + ms + " ms");
                }
                default -> result.setOutput("No-op");
            }

            result.setSuccess(true);
        } catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getMessage());
        }
        return result;
    }
}
