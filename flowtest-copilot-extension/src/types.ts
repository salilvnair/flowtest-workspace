export type AiTaskType =
  | 'GENERATE_API_SPEC'
  | 'GENERATE_MOCKS'
  | 'GENERATE_SCENARIO'
  | 'ANALYZE_VISION';

export interface AiTaskRequest {
  taskType: AiTaskType;
  prompt: string;
  context?: Record<string, unknown>;
}

export interface FlowtestExecutionEvent {
  type: 'RUN_STARTED' | 'STEP_STARTED' | 'STEP_PASSED' | 'STEP_FAILED' | 'RUN_COMPLETED' | string;
  scenarioId?: string;
  stepId?: string;
  at?: string;
  payload?: Record<string, unknown>;
}

export interface ScenarioRunRequest {
  scenario: Record<string, unknown>;
}
