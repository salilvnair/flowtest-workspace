package com.salilvnair.flowtest.engine.api;

import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import lombok.Data;

@Data
public class RunScenarioRequest {
    private TestScenario scenario;
}
