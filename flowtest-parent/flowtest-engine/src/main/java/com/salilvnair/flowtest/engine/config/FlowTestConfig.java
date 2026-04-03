package com.salilvnair.flowtest.engine.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
        FlowTestAiProperties.class,
        FlowTestEventCallbackProperties.class,
        FlowTestAllureProperties.class,
        FlowTestTemporalProperties.class
})
public class FlowTestConfig {
}
