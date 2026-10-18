import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";

type Rpc = (fn: string, args: object) => Promise<{ data: unknown; error: unknown }>;

/** GDPR erasure: removes every record of an email from the workspace and suppresses it. Super Admin only. */
export const gdprDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; email: string }) => {
    const email = String(d?.email ?? "").trim().toLowerCase();
    if (!d?.workspaceId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
    return { workspaceId: d.workspaceId, email };
  })
  .handler(async ({ data, context }) => {
    const { data: ok } = await (context.supabase as unknown as { rpc: Rpc }).rpc("has_ws_role", { _ws: data.workspaceId, _role: "super_admin" });
    if (ok !== true) throw new Error("Only Super Admins can do this");
    const { supabaseAdmin: admin } = await import("@/integrations/external/client.server");
    const { data: leads } = await admin.from("leads").select("id").eq("workspace_id", data.workspaceId).ilike("email", data.email);
    const ids = (leads ?? []).map((l) => l.id);
    if (ids.length) {
      const { data: cls } = await admin.from("campaign_leads").select("id").in("lead_id", ids);
      const clIds = (cls ?? []).map((c) => c.id);
      if (clIds.length) {
        await admin.from("replies").delete().in("campaign_lead_id", clIds);
        await admin.from("messages").delete().in("campaign_lead_id", clIds);
        await admin.from("campaign_leads").delete().in("id", clIds);
      }
      const { error } = await admin.from("leads").delete().in("id", ids);
      if (error) throw new Error(error.message);
    }
    const { data: exists } = await admin.from("suppression_list").select("id").eq("workspace_id", data.workspaceId).eq("value", data.email).maybeSingle();
    if (!exists) await admin.from("suppression_list").insert({ workspace_id: data.workspaceId, value: data.email, kind: "email", reason: "GDPR deletion request", created_by: context.userId });
    await admin.from("audit_log").insert({ workspace_id: data.workspaceId, actor: context.userId, action: "gdpr_delete", entity: "leads", details: { records: ids.length } });
    return { deleted: ids.length };
  });
