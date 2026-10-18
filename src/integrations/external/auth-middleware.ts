import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { EXTERNAL_URL, EXTERNAL_PUBLISHABLE_KEY, keyFetch } from "./config";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const auth = getRequest()?.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized");
  const supabase = createClient<Database>(EXTERNAL_URL, EXTERNAL_PUBLISHABLE_KEY, {
    global: { fetch: keyFetch(EXTERNAL_PUBLISHABLE_KEY), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized: Invalid token");
  return next({ context: { supabase, userId: data.user.id, claims: { sub: data.user.id, email: data.user.email } } });
});
