// Privileged server-only client for the external project (bypasses RLS).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { EXTERNAL_URL, keyFetch } from "./config";

function make() {
  const key = process.env["EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("Missing EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(EXTERNAL_URL, key, {
    global: { fetch: keyFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
let _c: ReturnType<typeof make> | undefined;
export const supabaseAdmin = new Proxy({} as ReturnType<typeof make>, {
  get(_, prop, receiver) {
    if (!_c) _c = make();
    return Reflect.get(_c, prop, receiver);
  },
});
