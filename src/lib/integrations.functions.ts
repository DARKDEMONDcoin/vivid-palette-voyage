import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";

export type Provider = "apollo" | "freshsales" | "slack" | "llm" | "phantombuster" | "vapi";
const PROVIDERS: Provider[] = ["apollo", "freshsales", "slack", "llm", "phantombuster", "vapi"];

type Input = { workspaceId: string; provider: Provider; secret?: string | undefined; config?: Record<string, string> | undefined };

function validate(d: unknown): Input {
  const x = d as Input;
  if (!x || typeof x.workspaceId !== "string" || !PROVIDERS.includes(x.provider)) throw new Error("Invalid input");
  if (x.secret !== undefined && (typeof x.secret !== "string" || x.secret.length > 500)) throw new Error("Invalid key");
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(x.config ?? {})) if (typeof v === "string") config[k] = v.trim().slice(0, 200);
  return { workspaceId: x.workspaceId, provider: x.provider, secret: x.secret?.trim(), config };
}

async function runTest(provider: Provider, secret: string, config: Record<string, string>): Promise<string | null> {
  try {
    let res: Response;
    if (provider === "apollo") {
      res = await fetch("https://api.apollo.io/v1/auth/health", { headers: { "X-Api-Key": secret, "Cache-Control": "no-cache" } });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { is_logged_in?: boolean };
        return j.is_logged_in === false ? "Apollo rejected this API key" : null;
      }
    } else if (provider === "freshsales") {
      const domain = (config["domain"] ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!/^[a-z0-9.-]+\.(myfreshworks|freshsales)\.(com|io)$/i.test(domain)) return "Enter your Freshsales domain, e.g. yourcompany.myfreshworks.com";
      res = await fetch(`https://${domain}/crm/sales/api/selector/owners`, { headers: { Authorization: `Token token=${secret}` } });
    } else if (provider === "llm") {
      const p = config["provider"] ?? "lovable";
      if (!config["research_model"] || !config["scoring_model"]) return "Choose both a research/copywriting model and a scoring model";
      if (p === "lovable") return null;
      if (!secret) return "Enter the API key for your own provider";
      if (p === "openai") res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${secret}` } });
      else if (p === "anthropic") res = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": secret, "anthropic-version": "2023-06-01" } });
      else if (p === "gemini") res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secret)}`);
      else return "Unknown AI provider";
    } else if (provider === "phantombuster") {
      if (!config["phantom_id"]) return "Enter the LinkedIn automation phantom ID";
      res = await fetch(`https://api.phantombuster.com/api/v2/agents/fetch?id=${encodeURIComponent(config["phantom_id"])}`, { headers: { "X-Phantombuster-Key": secret } });
    } else if (provider === "vapi") {
      if (!config["assistant_en"] && !config["assistant_ar"]) return "Enter at least one assistant ID (English or Arabic)";
      res = await fetch("https://api.vapi.ai/assistant?limit=1", { headers: { Authorization: `Bearer ${secret}` } });
    } else {
      if (!/^https:\/\/hooks\.slack\.com\//.test(secret)) return "Slack webhook URL must start with https://hooks.slack.com/";
      res = await fetch(secret, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "✅ Outreach AI connection test" }) });
    }
    if (res.ok) return null;
    const body = (await res.text()).slice(0, 200);
    return `Failed [${res.status}] ${body}`;
  } catch (e) {
    return e instanceof Error ? e.message : "Request failed";
  }
}

async function assertAdmin(supabase: { rpc: (...a: never[]) => unknown }, workspaceId: string) {
  const { data, error } = (await (supabase.rpc as (fn: string, args: object) => Promise<{ data: unknown; error: unknown }>)(
    "has_ws_role",
    { _ws: workspaceId, _role: "super_admin" },
  ));
  if (error || data !== true) throw new Error("Only Super Admins can manage integrations");
}

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/external/client.server");
    const { data: existing } = await supabaseAdmin.from("integrations").select("id").eq("workspace_id", data.workspaceId).eq("provider", data.provider).maybeSingle();
    let secret = data.secret;
    if (!secret && existing) {
      const { data: s } = await supabaseAdmin.from("integration_secrets").select("secret").eq("integration_id", existing.id).maybeSingle();
      secret = s?.secret;
    }
    if (data.provider === "vapi") {
      // Fall back to keys saved through the secure form
      secret = secret || process.env["VAPI_API_KEY"] || undefined;
      const c = (data.config ??= {});
      c["assistant_en"] ||= process.env["VAPI_ASSISTANT_EN"] ?? "";
      c["assistant_ar"] ||= process.env["VAPI_ASSISTANT_AR"] ?? "";
      c["phone_number_id"] ||= process.env["VAPI_PHONE_NUMBER_ID"] ?? "";
    }
    const builtin = data.provider === "llm" && (data.config?.["provider"] ?? "lovable") === "lovable";
    if (builtin) secret = "";
    else if (!secret) throw new Error("Enter the API key first");
    const err = await runTest(data.provider, secret ?? "", data.config ?? {});
    const { data: row, error } = await supabaseAdmin.from("integrations").upsert(
      { workspace_id: data.workspaceId, provider: data.provider, config: data.config ?? {}, status: err ? "error" : "connected", last_error: err, last_tested_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "workspace_id,provider" },
    ).select("id").single();
    if (error) throw new Error(error.message);
    if (builtin) await supabaseAdmin.from("integration_secrets").delete().eq("integration_id", row.id);
    else await supabaseAdmin.from("integration_secrets").upsert({ integration_id: row.id, secret: secret!, updated_at: new Date().toISOString() });
    return { ok: !err, error: err };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/external/client.server");
    await supabaseAdmin.from("integrations").delete().eq("workspace_id", data.workspaceId).eq("provider", data.provider);
    return { ok: true };
  });
