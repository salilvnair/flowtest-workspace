package com.salilvnair.flowtest.engine.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "flowtest.ai")
public class FlowTestAiProperties {
    private String mode = "auto";
}
