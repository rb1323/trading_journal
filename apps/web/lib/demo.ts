import { notFound } from "next/navigation";

export function assertDemoEnabled(): void {
  if (process.env.DEMO_ENABLED === "false") notFound();
}
