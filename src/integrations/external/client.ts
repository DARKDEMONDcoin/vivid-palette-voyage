import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { EXTERNAL_URL, EXTERNAL_PUBLISHABLE_KEY, keyFetch } from "./config";

function make() {
  return createClient<Database>(EXTERNAL_URL, EXTERNAL_PUBLISHABLE_KEY, {
    global: { fetch: keyFetch(EXTERNAL_PUBLISHABLE_KEY) },
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}
let _c: ReturnType<typeof make> | undefined;
export const supabase = new Proxy({} as ReturnType<typeof make>, {
  get(_, prop, receiver) {
    if (!_c) _c = make();
    return Reflect.get(_c, prop, receiver);
  },
});
