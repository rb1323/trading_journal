import { createClient } from "@supabase/supabase-js";
import { serviceSupabaseEnv } from "../env";

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = serviceSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

