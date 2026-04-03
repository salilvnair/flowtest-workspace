package com.salilvnair.flowtest.engine.execution;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WireMockRunMetadata {
    private boolean enabled;
    private String baseUrl;
    private Integer port;
    private Integer stubCount;
}
