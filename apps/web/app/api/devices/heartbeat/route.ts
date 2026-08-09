import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";

export async function POST(request: Request) {
  const auth = await authenticateDevice(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { version?: string; state?: unknown };
  const patch: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
    local_state: typeof body.state === "object" && body.state !== null ? body.state : {}
  };
  if (body.version?.trim()) patch.version = body.version.trim();
  const { error } = await auth.admin.from("sync_devices").update(patch).eq("id", auth.device.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

