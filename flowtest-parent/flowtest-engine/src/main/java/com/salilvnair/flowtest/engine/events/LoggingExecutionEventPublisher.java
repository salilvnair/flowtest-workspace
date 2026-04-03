package com.salilvnair.flowtest.engine.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingExecutionEventPublisher implements ExecutionEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(LoggingExecutionEventPublisher.class);

    @Override
    public void publish(ExecutionEvent event) {
        log.info("flowtest-event type={} scenarioId={} stepId={} payload={}",
                event.type(), event.scenarioId(), event.stepId(), event.payload());
    }
}
