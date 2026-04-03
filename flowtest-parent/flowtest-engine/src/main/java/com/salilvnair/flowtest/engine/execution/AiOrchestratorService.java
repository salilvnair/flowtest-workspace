package com.salilvnair.flowtest.engine.execution;

import com.salilvnair.flowtest.ai.spi.AiRequest;
import com.salilvnair.flowtest.ai.spi.AiResponse;
import com.salilvnair.flowtest.ai.spi.AiTaskType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class AiOrchestratorService {

    private final AiGatewayRouter router;

    public AiResponse execute(AiTaskType taskType, String prompt, Map<String, Object> context) {
        return router.resolve().execute(new AiRequest(taskType, prompt, context));
    }
}
