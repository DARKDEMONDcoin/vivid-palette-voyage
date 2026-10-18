// Server-only: launches a LinkedIn action through the workspace's Phantombuster account.
import { integration } from "./sequence.server";
import { LINKEDIN_ACTION_META, phantomFor, type LinkedInAction } from "./linkedin";

type Admin = (typeof import("@/integrations/external/client.server"))["supabaseAdmin"];

export async function launchLinkedInAction(admin: Admin, input: {
  workspaceId: string; leadId: string; action: LinkedInAction; profileUrl: string | null; text: string; messageId?: string | null; createdBy?: string | null;
}): Promise<{ waiting: boolean; error: string | null }> {
  let waiting = false, error: string | null = null;
  const p = await integration(admin, input.workspaceId, "phantombuster");
  const phantom = p ? phantomFor(p.config, input.action) : null;
  if (!p) { waiting = true; error = "Phantombuster not connected"; }
  else if (!phantom) { waiting = true; error = `No phantom set for "${LINKEDIN_ACTION_META[input.action].label}"`; }
  else if (!input.profileUrl && input.action !== "share") error = "Lead has no LinkedIn URL";
  else if (LINKEDIN_ACTION_META[input.action].needsText && !input.text.trim()) error = "Text is required for this action";
  else {
    const text = input.action === "connect" ? input.text.slice(0, 300) : input.text;
    // Phantoms differ in argument names; send the common ones so any LinkedIn phantom picks up what it needs.
    const argument: Record<string, string> = { action: input.action };
    if (input.profileUrl) { argument["profileUrl"] = input.profileUrl; argument["spreadsheetUrl"] = input.profileUrl; argument["profileUrls"] = input.profileUrl; }
    if (text) { argument["message"] = text; argument["comment"] = text; argument["postContent"] = text; }
    try {
      const r = await fetch("https://api.phantombuster.com/api/v2/agents/launch", {
        method: "POST", headers: { "X-Phantombuster-Key": p.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ id: phantom, argument }) });
      if (!r.ok) error = `Phantombuster [${r.status}]: ${(await r.text()).slice(0, 200)}`;
    } catch (e) { error = e instanceof Error ? e.message : "Phantombuster request failed"; }
  }
  await admin.from("linkedin_actions").insert({ workspace_id: input.workspaceId, lead_id: input.leadId, message_id: input.messageId ?? null, action: input.action,
    content: input.text || null, status: error ? (waiting ? "queued" : "failed") : "launched", error, created_by: input.createdBy ?? null });
  return { waiting, error };
}
