package com.salilvnair.flowtest.engine.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "flowtest.temporal")
public class FlowTestTemporalProperties {
    private boolean enabled = true;
    private String target = "127.0.0.1:7233";
    private String namespace = "default";
    private String taskQueue = "flowtest-task-queue";
    private String workflowIdPrefix = "flowtest-run";
}
