"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { VISION_FORM_TEMPLATE } from "@/lib/vision-form-template";
import { buildVisionNormalizedRequest, type VisionSubmitPayload } from "@/lib/form-normalizers";

export default function VisionFormPage() {
  const router = useRouter();

  const onMessage = useCallback((msg: { type?: string; payload?: any }) => {
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

