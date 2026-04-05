"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { SCENARIO_FORM_TEMPLATE } from "@/lib/scenario-form-template";
import { buildScenarioNormalizedRequest, type ScenarioSubmitPayload } from "@/lib/form-normalizers";

export default function ScenarioFormPage() {
  const router = useRouter();
  const navigateFromMenu = (target: unknown) => {
    const t = String(target || "").trim();
    if (!t) return false;
    const allowed = new Set(["/", "/scenario-form", "/mocks-form", "/vision-form", "/run-center"]);
    if (!allowed.has(t)) return false;
    router.push(t);
    return true;
  };

  const onMessage = useCallback((msg: { type?: string; payload?: any }) => {
    if (msg.type === "navigate") {
      navigateFromMenu(msg.payload?.target);
      return;
    }
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
