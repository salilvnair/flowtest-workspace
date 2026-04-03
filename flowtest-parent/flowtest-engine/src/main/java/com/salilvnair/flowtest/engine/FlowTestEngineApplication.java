package com.salilvnair.flowtest.engine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.salilvnair.flowtest")
public class FlowTestEngineApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlowTestEngineApplication.class, args);
    }
}
