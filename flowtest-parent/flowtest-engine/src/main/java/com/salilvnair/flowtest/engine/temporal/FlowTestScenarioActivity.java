package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;

@ActivityInterface
public interface FlowTestScenarioActivity {

    @ActivityMethod
    ScenarioRunResult execute(TestScenario scenario);
}
