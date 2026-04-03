package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import io.temporal.activity.ActivityOptions;
import io.temporal.workflow.Workflow;

import java.time.Duration;

public class FlowTestScenarioWorkflowImpl implements FlowTestScenarioWorkflow {

    private final FlowTestScenarioActivity activity = Workflow.newActivityStub(
            FlowTestScenarioActivity.class,
            ActivityOptions.newBuilder()
                    .setStartToCloseTimeout(Duration.ofMinutes(10))
                    .build()
    );

    @Override
    public ScenarioRunResult run(TestScenario scenario) {
        return activity.execute(scenario);
    }
}
