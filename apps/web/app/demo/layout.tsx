import { DemoShell } from "@/components/demo-shell";
import { assertDemoEnabled } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  assertDemoEnabled();
  return <DemoShell>{children}</DemoShell>;
}
