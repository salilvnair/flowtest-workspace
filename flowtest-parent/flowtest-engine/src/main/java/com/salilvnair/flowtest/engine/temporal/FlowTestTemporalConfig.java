package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.config.FlowTestTemporalProperties;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "flowtest.temporal", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FlowTestTemporalConfig {

    private final FlowTestTemporalProperties properties;

    @Bean
    public WorkflowServiceStubs workflowServiceStubs() {
        return WorkflowServiceStubs.newServiceStubs(
                WorkflowServiceStubsOptions.newBuilder()
                        .setTarget(properties.getTarget())
                        .build()
        );
    }

    @Bean
    public WorkflowClient workflowClient(WorkflowServiceStubs stubs) {
        return WorkflowClient.newInstance(
                stubs,
                WorkflowClientOptions.newBuilder()
                        .setNamespace(properties.getNamespace())
                        .build()
        );
    }

    @Bean(initMethod = "start", destroyMethod = "shutdown")
    public WorkerFactory workerFactory(WorkflowClient workflowClient, FlowTestScenarioActivity activity) {
        WorkerFactory factory = WorkerFactory.newInstance(workflowClient);
        Worker worker = factory.newWorker(properties.getTaskQueue());
        worker.registerWorkflowImplementationTypes(FlowTestScenarioWorkflowImpl.class);
        worker.registerActivitiesImplementations(activity);
        return factory;
    }
}
