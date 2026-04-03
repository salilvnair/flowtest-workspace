package com.salilvnair.flowtest.engine.temporal;

import com.salilvnair.flowtest.engine.execution.ScenarioRunResult;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TemporalRunResponse {
    private String workflowId;
    private String runId;
    private String namespace;
    private boolean completed;
    private ScenarioRunResult result;
}
