export type RunState = "Initializing" | "Running" | "Completed" | "Failed";

export type TimelineStatus = "info" | "running" | "success" | "warn" | "warning" | "error";

export type TimelineEvent = {
  id: string;
  time: string;
  stage: string;
  title: string;
  detail?: string;
  status: TimelineStatus;
  control: "LLM" | "Java" | "VS Code Copilot";
  elapsed?: string;
  meta?: Record<string, string | number | boolean>;
  actions?: Array<{
    label: string;
    title: string;
    content: string;
  }>;
};

export type RunMeta = {
  runName: string;
  orchestrationId: string;
  temporal: string;
  outputPath: string;
  wiremockBaseUrl: string;
  allureResults: string;
  allureReport: string;
};

export type IntakeDocType = "SUCCESS_SAMPLE" | "FAILURE_SAMPLE" | "AID" | "HLD";

export type IntakeDoc = {
  id: string;
  type: IntakeDocType;
  title: string;
  content: string;
  fileName?: string;
};

export type StartIntakePayload = {
  runName: string;
  outputPath?: string;
  successSamples: IntakeDoc[];
  failureSamples: IntakeDoc[];
  aid: IntakeDoc | null;
  hld: IntakeDoc | null;
  additionalInfo?: string;
  multiUpload?: boolean;
  fakeRun?: boolean;
};
