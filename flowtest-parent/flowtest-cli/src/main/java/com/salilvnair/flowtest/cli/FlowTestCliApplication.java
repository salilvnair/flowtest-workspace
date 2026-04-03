package com.salilvnair.flowtest.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salilvnair.flowtest.engine.FlowTestEngineApplication;
import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import com.salilvnair.flowtest.engine.execution.ScenarioEngine;
import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.nio.file.Files;
import java.nio.file.Path;

public class FlowTestCliApplication {

    public static void main(String[] args) throws Exception {
        if (args.length < 2 || !"run".equalsIgnoreCase(args[0])) {
            System.out.println("Usage: flowtest run <scenario.json>");
            System.exit(1);
        }

        Path scenarioPath = Path.of(args[1]);
        if (!Files.exists(scenarioPath)) {
            System.out.println("Scenario file not found: " + scenarioPath);
            System.exit(1);
        }

        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(FlowTestEngineApplication.class).run()) {
            ObjectMapper objectMapper = context.getBean(ObjectMapper.class);
            ScenarioEngine engine = context.getBean(ScenarioEngine.class);

            TestScenario scenario = objectMapper.readValue(Files.readString(scenarioPath), TestScenario.class);
            ScenarioRunResult runResult = engine.execute(scenario);

            System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(runResult));
            System.exit(runResult.isSuccess() ? 0 : 2);
        }
    }
}
