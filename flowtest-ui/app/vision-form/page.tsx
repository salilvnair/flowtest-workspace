"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { VISION_FORM_TEMPLATE } from "@/lib/vision-form-template";
import { buildVisionNormalizedRequest, type VisionSubmitPayload } from "@/lib/form-normalizers";

export default function VisionFormPage() {
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
      const normalized = buildVisionNormalizedRequest((msg.payload || {}) as VisionSubmitPayload);
      localStorage.setItem("flowtest:lastVisionRequest", normalized);
      router.push("/");
    }
  }, [router]);

  return <ExtensionFormFrame template={VISION_FORM_TEMPLATE} onMessage={onMessage} />;
}
