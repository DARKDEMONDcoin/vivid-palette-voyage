import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";
import { isLinkedInAction, type LinkedInAction } from "./linkedin";

export const runLeadLinkedInAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string; action: LinkedInAction; text?: string }) => {
    if (!d?.leadId || !isLinkedInAction(d.action)) throw new Error("Choose a LinkedIn action");
    return { leadId: String(d.leadId), action: d.action, text: String(d.text ?? "").trim().slice(0, 3000) };
  })
  .handler(async ({ data, context }) => {
    // RLS read proves the caller can see this lead; then check they aren't a viewer.
    const { data: lead } = await context.supabase.from("leads").select("id,workspace_id,linkedin_url").eq("id", data.leadId).maybeSingle();
    if (!lead) throw new Error("Lead not found");
    const { data: member } = await context.supabase.from("workspace_members").select("role").eq("workspace_id", lead.workspace_id).eq("user_id", context.userId).eq("active", true).maybeSingle();
    if (!member || member.role === "viewer") throw new Error("You don't have permission to run LinkedIn actions");
    const { supabaseAdmin } = await import("@/integrations/external/client.server");
    const { data: ws } = await supabaseAdmin.from("workspaces").select("outreach_paused").eq("id", lead.workspace_id).single();
    if (ws?.outreach_paused) throw new Error("Outreach is paused for this workspace");
    const { launchLinkedInAction } = await import("./linkedin.server");
    const r = await launchLinkedInAction(supabaseAdmin, { workspaceId: lead.workspace_id, leadId: lead.id, action: data.action, profileUrl: lead.linkedin_url, text: data.text, createdBy: context.userId });
    if (r.error) throw new Error(r.error);
    return { ok: true };
  });
