package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.config.FlowTestTemporalProperties;
import com.salilvnair.flowtest.engine.dsl.model.TestScenario;
import io.temporal.api.common.v1.WorkflowExecution;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "flowtest.temporal", name = "enabled", havingValue = "true", matchIfMissing = true)
public class TemporalScenarioOrchestrator {

    private final WorkflowClient workflowClient;
    private final FlowTestTemporalProperties properties;

    public TemporalRunResponse run(TestScenario scenario) {
        String workflowId = properties.getWorkflowIdPrefix() + "-" + sanitize(scenario.getScenarioId()) + "-" + UUID.randomUUID();

        WorkflowOptions options = WorkflowOptions.newBuilder()
                .setTaskQueue(properties.getTaskQueue())
                .setWorkflowId(workflowId)
                .build();

        FlowTestScenarioWorkflow workflow = workflowClient.newWorkflowStub(FlowTestScenarioWorkflow.class, options);
        WorkflowExecution execution = WorkflowClient.start(workflow::run, scenario);

        WorkflowStub stub = WorkflowStub.fromTyped(workflow);
        var result = stub.getResult(com.salilvnair.flowtest.engine.execution.ScenarioRunResult.class);

        return TemporalRunResponse.builder()
                .workflowId(execution.getWorkflowId())
                .runId(execution.getRunId())
                .namespace(properties.getNamespace())
                .completed(true)
                .result(result)
                .build();
    }

    private String sanitize(String raw) {
        return String.valueOf(raw == null ? "scenario" : raw)
                .toLowerCase()
                .replaceAll("[^a-z0-9-]+", "-")
                .replaceAll("^-+|-+$", "");
    }
}
