package com.salilvnair.flowtest.ai.external;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "flowtest.ai.external")
public class ExternalAiProperties {
    private boolean enabled = true;
    private String endpoint = "http://localhost:7171/flowtest/ai/execute";
    private String authToken;
}
