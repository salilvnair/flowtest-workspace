package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

@WorkflowInterface
public interface FlowTestScenarioWorkflow {

    @WorkflowMethod
    ScenarioRunResult run(TestScenario scenario);
}
