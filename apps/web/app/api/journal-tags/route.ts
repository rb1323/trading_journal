import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const categories = new Set(["setup", "mistake", "emotion", "custom"]);

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { name?: unknown; category?: unknown; color?: unknown };
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const category = typeof body?.category === "string" ? body.category : "";
  const color = typeof body?.color === "string" ? body.color : "#00e7f2";
  if (!name || name.length > 40) return NextResponse.json({ error: "Tagin nimen pitää olla 1–40 merkkiä." }, { status: 400 });
  if (!categories.has(category) || !/^#[0-9a-fA-F]{6}$/.test(color)) return NextResponse.json({ error: "Virheellinen tagi." }, { status: 400 });

  const { data, error } = await supabase.from("journal_tags").insert({ user_id: user.id, name, category, color }).select("id,name,category,color").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Samanniminen tagi on jo olemassa tässä kategoriassa." : error.message }, { status: error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ tag: data }, { status: 201 });
}
