import { Suspense } from "react";
import { FlowtestDashboard } from "@/components/flowtest-dashboard";

export default function RunCenterPage() {
  return (
    <Suspense fallback={<div style={{ padding: 12, color: "#9aa7bb" }}>Loading run center...</div>}>
      <FlowtestDashboard />
    </Suspense>
  );
}
