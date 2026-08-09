import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasPublicSupabaseEnv()) {
    return <section className="center-card"><p className="eyebrow">SETUP REQUIRED</p><h1>Yhdistä Supabase</h1><p className="muted">Kopioi .env.example tiedostoksi apps/web/.env.local ja lisää projektin tunnukset.</p></section>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/trades");
  return (
    <section className="login-page">
      <div className="login-copy"><p className="eyebrow">DAS LIVE IMPORT</p><h1>Treidisi.<br />Yksi luotettava totuus.</h1><p>Synkronoi executionit suoraan DAS Traderista ja näe jokainen round trip ilman manuaalista vientiä.</p></div>
      <div className="center-card"><p className="eyebrow">KIRJAUDU</p><h2>Tervetuloa takaisin</h2><LoginForm /></div>
    </section>
  );
}

