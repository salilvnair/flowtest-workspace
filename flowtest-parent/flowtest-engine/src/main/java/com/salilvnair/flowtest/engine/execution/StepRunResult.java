package com.salilvnair.flowtest.engine.execution;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StepRunResult {
    private String stepId;
    private String stepType;
    private boolean success;
    private Object output;
    private String errorMessage;
}
