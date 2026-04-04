"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { START_FORM_TEMPLATE } from "@/lib/start-form-template";

export default function HomePage() {
  const router = useRouter();

  const onMessage = useCallback((msg: { type?: string; payload?: any }) => {
    if (msg.type === "cancel") {
      return;
    }
    if (msg.type === "fake") {
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
      localStorage.setItem("flowtest:lastIntakePayload", JSON.stringify(msg.payload || {}));
      router.push("/run-center");
    }
  }, [router]);

  return <ExtensionFormFrame template={START_FORM_TEMPLATE} onMessage={onMessage} />;
}

