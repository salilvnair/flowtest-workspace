package com.salilvnair.flowtest.ai.openai;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "flowtest.ai.openai")
public class OpenAiProperties {
    private boolean enabled;
    private String apiKey;
    private String model = "gpt-5.4-mini";
    private String endpoint = "https://api.openai.com/v1/responses";
}
