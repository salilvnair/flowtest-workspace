package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.execution.ScenarioEngine;
import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FlowTestScenarioActivityImpl implements FlowTestScenarioActivity {

    private final ScenarioEngine scenarioEngine;

    @Override
    public ScenarioRunResult execute(TestScenario scenario) {
        return scenarioEngine.execute(scenario);
    }
}
