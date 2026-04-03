package com.salilvnair.flowtest.engine.execution;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AllureRunMetadata {
    private boolean enabled;
    private String resultsDirectory;
    private String resultsDirectoryAbsolute;
    private String reportDirectory;
    private String reportDirectoryAbsolute;
    private String reportIndexAbsolute;
    private String generateCommand;
}
