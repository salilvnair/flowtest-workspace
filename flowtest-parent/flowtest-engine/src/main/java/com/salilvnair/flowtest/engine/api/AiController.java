package com.salilvnair.flowtest.engine.api;

import com.salilvnair.flowtest.ai.spi.AiResponse;
import com.salilvnair.flowtest.engine.execution.AiOrchestratorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiOrchestratorService aiOrchestratorService;

    @PostMapping("/execute")
    public ResponseEntity<AiResponse> execute(@RequestBody AiTaskRequest request) {
        if (request.getTaskType() == null || request.getPrompt() == null || request.getPrompt().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        AiResponse response = aiOrchestratorService.execute(
                request.getTaskType(),
                request.getPrompt(),
                request.getContext() == null ? java.util.Map.of() : request.getContext()
        );

        return ResponseEntity.ok(response);
    }
}
