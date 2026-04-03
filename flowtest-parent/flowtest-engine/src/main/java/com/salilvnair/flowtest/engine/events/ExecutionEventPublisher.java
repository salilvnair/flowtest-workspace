package com.salilvnair.flowtest.engine.events;

@FunctionalInterface
public interface ExecutionEventPublisher {
    void publish(ExecutionEvent event);
}
