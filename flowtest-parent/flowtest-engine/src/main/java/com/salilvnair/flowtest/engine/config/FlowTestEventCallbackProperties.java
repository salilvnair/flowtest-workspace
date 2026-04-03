package com.salilvnair.flowtest.engine.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "flowtest.execution.callbacks")
public class FlowTestEventCallbackProperties {
    private boolean webhookEnabled;
    private String webhookUrl;
    private String authToken;
}
