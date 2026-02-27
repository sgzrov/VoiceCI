"use client";

import { RunDetailView } from "@/components/run-detail-view";
import { DEMO_RUN } from "@/lib/demo-data";

export default function DemoRunPage() {
  return <RunDetailView run={DEMO_RUN} isDemo />;
}
