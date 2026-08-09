"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setMessage(error ? error.message : "Kirjautumislinkki lähetettiin sähköpostiisi.");
    setBusy(false);
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">Sähköposti</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sinä@example.com" />
      <button className="primary" disabled={busy}>{busy ? "Lähetetään…" : "Lähetä kirjautumislinkki"}</button>
      {message && <p className="form-message">{message}</p>}
    </form>
  );
}

