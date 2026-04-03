package com.salilvnair.flowtest.engine.events;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Primary
@RequiredArgsConstructor
public class CompositeExecutionEventPublisher implements ExecutionEventPublisher {

    private final List<ExecutionEventPublisher> availablePublishers;
    private List<ExecutionEventPublisher> publishers;

    @PostConstruct
    void init() {
        publishers = availablePublishers.stream()
                .filter(p -> !(p instanceof CompositeExecutionEventPublisher))
                .toList();
    }

    @Override
    public void publish(ExecutionEvent event) {
        publishers.forEach(p -> {
            try {
                p.publish(event);
            } catch (Exception ignored) {
                // callbacks must never break deterministic execution
            }
        });
    }
}
