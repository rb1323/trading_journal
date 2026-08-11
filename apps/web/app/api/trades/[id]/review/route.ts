import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statuses = new Set(["unreviewed", "draft", "reviewed"]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as null | {
    notes?: unknown;
    rating?: unknown;
    followedPlan?: unknown;
    status?: unknown;
    version?: unknown;
    tagIds?: unknown;
  };
  if (!body) return NextResponse.json({ error: "Virheellinen pyyntö." }, { status: 400 });

  const notes = typeof body.notes === "string" ? body.notes : "";
  const rating = body.rating === null ? null : Number(body.rating);
  const followedPlan = body.followedPlan === null ? null : body.followedPlan;
  const status = typeof body.status === "string" ? body.status : "";
  const version = Number(body.version);
  const tagIds = Array.isArray(body.tagIds) && body.tagIds.every((tag) => typeof tag === "string") ? body.tagIds : null;

  if (notes.length > 20_000) return NextResponse.json({ error: "Muistiinpano voi olla enintään 20 000 merkkiä." }, { status: 400 });
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return NextResponse.json({ error: "Arvosanan pitää olla 1–5." }, { status: 400 });
  if (followedPlan !== null && typeof followedPlan !== "boolean") return NextResponse.json({ error: "Virheellinen plan-arvo." }, { status: 400 });
  if (!statuses.has(status)) return NextResponse.json({ error: "Virheellinen review-tila." }, { status: 400 });
  if (!Number.isInteger(version) || version < 0 || !tagIds) return NextResponse.json({ error: "Virheellinen versio tai tagit." }, { status: 400 });

  const { data: review, error } = await supabase.rpc("save_trade_review", {
    p_trade_id: id,
    p_notes: notes,
    p_rating: rating,
    p_followed_plan: followedPlan,
    p_status: status,
    p_expected_version: version,
    p_tag_ids: tagIds
  });
  if (error) {
    const conflict = error.message.includes("version conflict");
    return NextResponse.json({ error: conflict ? "Muistiinpanoa on muokattu toisessa ikkunassa. Päivitä sivu ennen jatkamista." : error.message }, { status: conflict ? 409 : 400 });
  }
  return NextResponse.json({ review, tagIds });
}
