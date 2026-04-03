package com.salilvnair.flowtest.engine.dsl.model;

import lombok.Data;

@Data
public class AssertionDefinition {
    private String type;
    private String path;
    private Object expected;
}
