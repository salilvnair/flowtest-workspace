package com.salilvnair.flowtest.engine.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "flowtest.reporting.allure")
public class FlowTestAllureProperties {
    private boolean enabled = true;
    private String resultsDirectory = "allure-results";
    private String reportDirectory = "allure-report";
}
