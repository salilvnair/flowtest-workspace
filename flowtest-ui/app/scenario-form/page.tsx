"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { SCENARIO_FORM_TEMPLATE } from "@/lib/scenario-form-template";
import { buildScenarioNormalizedRequest, type ScenarioSubmitPayload } from "@/lib/form-normalizers";

export default function ScenarioFormPage() {
  const router = useRouter();

  const onMessage = useCallback((msg: { type?: string; payload?: any }) => {
    if (msg.type === "cancel") {
      router.push("/");
      return;
    }
    if (msg.type === "submit") {
      const normalized = buildScenarioNormalizedRequest((msg.payload || {}) as ScenarioSubmitPayload);
      localStorage.setItem("flowtest:lastScenarioRequest", normalized);
      router.push("/");
    }
  }, [router]);

  return <ExtensionFormFrame template={SCENARIO_FORM_TEMPLATE} onMessage={onMessage} />;
}

