// Your own external database project. The publishable key is public by design.
export const EXTERNAL_URL = "https://lhfjgpffizxlwmxsxvuc.supabase.co";
export const EXTERNAL_PUBLISHABLE_KEY = "sb_publishable_SDseuLWCfVx1DgvFWSRshA_dlOaBOog";

export function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if ((key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}
