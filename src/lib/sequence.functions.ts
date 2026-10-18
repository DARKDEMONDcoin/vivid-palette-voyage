import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";

export type StepInput = { channel: "email" | "linkedin" | "call"; delay_days: number; instructions: string };
type Rpc = (fn: string, args: object) => Promise<{ data: unknown; error: unknown }>;

async function assertEdit(supabase: unknown, campaignId: string) {
  const { data, error } = await (supabase as { rpc: Rpc }).rpc("can_edit_campaign", { _c: campaignId });
  if (error || data !== true) throw new Error("You can't edit this campaign");
  const { supabaseAdmin } = await import("@/integrations/external/client.server");
  const { data: c } = await supabaseAdmin.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c) throw new Error("Campaign not found");
  return { admin: supabaseAdmin, campaign: c };
}

export const saveSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; steps: StepInput[] }) => {
    if (!d?.campaignId || !Array.isArray(d.steps) || !d.steps.length || d.steps.length > 8) throw new Error("Add 1–8 steps");
    return { campaignId: d.campaignId, steps: d.steps.map((s) => ({
      channel: (["email", "linkedin", "call"].includes(s.channel) ? s.channel : "email") as StepInput["channel"],
      delay_days: Math.min(60, Math.max(0, Math.round(Number(s.delay_days) || 0))), instructions: String(s.instructions ?? "").slice(0, 1000) })) };
  })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    if (campaign.status !== "draft") throw new Error("Pause editing: the sequence can only change while the campaign is a draft");
    await admin.from("campaign_steps").delete().eq("campaign_id", campaign.id);
    const { error } = await admin.from("campaign_steps").insert(data.steps.map((s, i) => ({ ...s, step_order: i + 1, campaign_id: campaign.id, workspace_id: campaign.workspace_id })));
    if (error) throw new Error(error.message);
    if (campaign.wizard_step < 6) await admin.from("campaigns").update({ wizard_step: 6 }).eq("id", campaign.id);
    return { ok: true };
  });

const copySchema = {
  type: "object", additionalProperties: false, required: ["messages"],
  properties: { messages: { type: "array", items: { type: "object", additionalProperties: false, required: ["step", "subject", "body"],
    properties: { step: { type: "integer" }, subject: { type: "string" }, body: { type: "string" } } } } },
};

export const generateCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; ids: string[] }) => {
    if (!d?.campaignId || !Array.isArray(d.ids) || d.ids.length > 3) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    const { getLlmConfig, llmJson } = await import("./llm.server");
    const cfg = await getLlmConfig(campaign.workspace_id, "research");
    const [{ data: steps }, { data: agent }, { data: org }] = await Promise.all([
      admin.from("campaign_steps").select("*").eq("campaign_id", campaign.id).order("step_order"),
      admin.from("agents").select("name,tone,signature,bio").eq("id", campaign.agent_id).single(),
      admin.from("organizations").select("name,description,summary,summary_status,signature").eq("id", campaign.organization_id).single(),
    ]);
    if (!steps?.length) throw new Error("Save the sequence first");
    const { data: rows } = await admin.from("campaign_leads").select("id,research,lead:leads(*)").eq("campaign_id", campaign.id).eq("decision", "qualified").in("id", data.ids);
    const { data: allIds } = await admin.from("campaign_leads").select("id").eq("campaign_id", campaign.id).eq("decision", "qualified").order("created_at");
    const order = new Map((allIds ?? []).map((r, i) => [r.id, i]));
    const results = await Promise.all((rows ?? []).map(async (r) => {
      const l = r.lead as unknown as Record<string, string | null>;
      const variant = campaign.ab_testing && (order.get(r.id) ?? 0) % 2 === 1 ? "B" : "A";
      try {
        const lang = campaign.language === "auto" ? (l["language"] || "the lead's language (default English)") : campaign.language === "ar" ? "Arabic" : "English";
        const input = `Brand: ${org?.name}\n${org?.description ?? ""}\nApproved brand summary: ${org?.summary_status === "approved" ? JSON.stringify(org.summary) : "not approved"}\n\nSender: ${agent?.name}. Tone: ${agent?.tone}. Signature:\n${agent?.signature || org?.signature || agent?.name}\n\n` +
          `Lead: ${JSON.stringify({ first_name: l["first_name"], last_name: l["last_name"], title: l["title"], company: l["company"], industry: l["industry"], country: l["country"] })}\nResearch: ${r.research ? JSON.stringify(r.research) : "none"}\n\n` +
          `Write in ${lang}. ${variant === "B" ? "This is variant B: use a noticeably different angle and subject line than a standard opener (e.g. lead with a question or insight)." : ""}\nSteps:\n` +
          steps.map((s) => `step ${s.step_order}: ${s.channel}${s.delay_days ? ` (${s.delay_days} days later)` : ""}${s.instructions ? ` — ${s.instructions}` : ""}`).join("\n");
        const out = await llmJson<{ messages: { step: number; subject: string; body: string }[] }>(cfg,
          "You are an SDR writing a multi-step B2B outreach sequence. For each step return one message. email: subject (short, no clickbait) and body (under 120 words, plain text, include the signature). linkedin: subject empty, body under 280 characters, no signature. call: subject empty, body = 3-5 bullet talking points for a voice assistant. Use only facts from the brand info and research; never invent numbers, clients or news. Later steps reference earlier ones briefly.",
          input, "sequence_copy", copySchema);
        const rowsOut = steps.map((s) => {
          const m = out.messages.find((x) => x.step === s.step_order) ?? out.messages[s.step_order - 1];
          return { campaign_id: campaign.id, campaign_lead_id: r.id, workspace_id: campaign.workspace_id, step_id: s.id, step_order: s.step_order, channel: s.channel, variant,
            subject: s.channel === "email" ? (m?.subject ?? "").slice(0, 200) : null, body: (m?.body ?? "").slice(0, 4000), status: "draft", approved_by: null, approved_at: null, error: null };
        });
        if (rowsOut.some((x) => !x.body)) throw new Error("AI skipped a step");
        const { error } = await admin.from("messages").upsert(rowsOut, { onConflict: "campaign_lead_id,step_id" });
        if (error) throw new Error(error.message);
        return { id: r.id, ok: true };
      } catch (e) { return { id: r.id, ok: false, error: e instanceof Error ? e.message : "Failed" }; }
    }));
    if (campaign.wizard_step < 7) await admin.from("campaigns").update({ wizard_step: 7 }).eq("id", campaign.id);
    return { results };
  });

export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => { if (!d?.campaignId) throw new Error("Invalid input"); return d; })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    if (campaign.status !== "draft") throw new Error("Campaign already launched");
    const { data: steps } = await admin.from("campaign_steps").select("id,step_order,delay_days").eq("campaign_id", campaign.id).order("step_order");
    const { data: msgs } = await admin.from("messages").select("id,campaign_lead_id,step_id,status").eq("campaign_id", campaign.id);
    const byLead = new Map<string, { id: string; step_id: string; status: string }[]>();
    for (const m of msgs ?? []) byLead.set(m.campaign_lead_id, [...(byLead.get(m.campaign_lead_id) ?? []), m]);
    const ready = [...byLead.entries()].filter(([, ms]) => (steps ?? []).every((s) => ms.find((m) => m.step_id === s.id)?.status === "approved"));
    if (!ready.length) throw new Error("No lead has every step approved yet");
    const offsets = new Map<string, number>(); let acc = 0;
    for (const s of steps ?? []) { acc += s.delay_days; offsets.set(s.id, acc); }
    const now = Date.now();
    for (const [, ms] of ready) for (const m of ms)
      await admin.from("messages").update({ status: "scheduled", scheduled_for: new Date(now + (offsets.get(m.step_id) ?? 0) * 86400000).toISOString() }).eq("id", m.id);
    await admin.from("campaign_leads").update({ status: "active" }).in("id", ready.map(([id]) => id));
    const { error: upErr } = await admin.from("campaigns").update({ status: "active", wizard_step: 8, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    if (upErr) throw new Error(`Couldn't activate the campaign: ${upErr.message}`);
    return { launched: ready.length, skipped: byLead.size - ready.length };
  });

export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; status: "active" | "paused" | "completed" }) => {
    if (!d?.campaignId || !["active", "paused", "completed"].includes(d.status)) throw new Error("Invalid input"); return d;
  })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    if (campaign.status === "draft") throw new Error("Launch the campaign first");
    const { error: stErr } = await admin.from("campaigns").update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    if (stErr) throw new Error(stErr.message);
    if (data.status === "completed") await admin.from("messages").update({ status: "skipped", error: "Campaign completed" }).eq("campaign_id", campaign.id).in("status", ["scheduled", "waiting"]);
    return { ok: true };
  });

export const runDueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    await admin.from("messages").update({ status: "scheduled", error: null }).eq("campaign_id", campaign.id).eq("status", "waiting");
    const { runDue } = await import("./sequence.server");
    return runDue(admin);
  });

export const SQL_CLASSES = ["interested", "meeting_request"];

export const logReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignLeadId: string; body: string; channel: string }) => {
    if (!d?.campaignLeadId || !d.body?.trim()) throw new Error("Paste the reply text");
    return { campaignLeadId: d.campaignLeadId, body: d.body.trim().slice(0, 8000), channel: ["email", "linkedin", "call"].includes(d.channel) ? d.channel : "email" };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: a0 } = await import("@/integrations/external/client.server");
    const { data: cl0 } = await a0.from("campaign_leads").select("campaign_id").eq("id", data.campaignLeadId).single();
    if (!cl0) throw new Error("Lead not found");
    const { admin, campaign } = await assertEdit(context.supabase, cl0.campaign_id);
    void campaign;
    const { processReply } = await import("./sequence.server");
    return processReply(admin, { campaignLeadId: data.campaignLeadId, body: data.body, channel: data.channel, createdBy: context.userId });
  });
