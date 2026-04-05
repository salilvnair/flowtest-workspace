"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { START_FORM_TEMPLATE } from "@/lib/start-form-template";

export default function HomePage() {
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
      return;
    }
    if (msg.type === "fake") {
      localStorage.removeItem("flowtest:lastIntakeResponse");
      localStorage.removeItem("flowtest:lastIntakeError");
      const payload = {
        runName: "flowtest-fake-run",
        successSamples: [],
        failureSamples: [],
        aid: null,
        hld: null,
        additionalInfo: "",
        multiUpload: true,
        fakeRun: true
      };
      localStorage.setItem("flowtest:lastIntakePayload", JSON.stringify(payload));
      router.push("/run-center?mode=fake");
      return;
    }
    if (msg.type === "submit") {
      const payload = msg.payload || {};
      localStorage.removeItem("flowtest:lastIntakeResponse");
      localStorage.removeItem("flowtest:lastIntakeError");
      localStorage.setItem("flowtest:lastIntakePayload", JSON.stringify(payload));
      router.push("/run-center");
      // Run Center owns the live SSE orchestration lifecycle now.
    }
  }, [router]);

  return <ExtensionFormFrame template={START_FORM_TEMPLATE} onMessage={onMessage} />;
}
