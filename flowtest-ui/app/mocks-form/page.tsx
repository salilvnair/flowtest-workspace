"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionFormFrame } from "@/components/extension-form-frame";
import { MOCKS_FORM_TEMPLATE } from "@/lib/mocks-form-template";
import { buildMocksNormalizedRequest, type MocksSubmitPayload } from "@/lib/form-normalizers";

export default function MocksFormPage() {
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
      const normalized = buildMocksNormalizedRequest((msg.payload || {}) as MocksSubmitPayload);
      localStorage.setItem("flowtest:lastMocksRequest", normalized);
      router.push("/");
    }
  }, [router]);

  return <ExtensionFormFrame template={MOCKS_FORM_TEMPLATE} onMessage={onMessage} />;
}
