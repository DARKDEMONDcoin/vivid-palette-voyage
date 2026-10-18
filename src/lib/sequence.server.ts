// Server-only sequence engine: sends due messages through the right channel provider.
type Admin = (typeof import("@/integrations/external/client.server"))["supabaseAdmin"];

export async function integration(admin: Admin, ws: string, provider: string) {
  const { data: row } = await admin.from("integrations").select("id,status,config").eq("workspace_id", ws).eq("provider", provider).maybeSingle();
  if (!row || row.status !== "connected") return null;
  const { data: s } = await admin.from("integration_secrets").select("secret").eq("integration_id", row.id).maybeSingle();
  if (!s?.secret) return null;
  return { config: (row.config ?? {}) as Record<string, string>, secret: s.secret };
}

function localParts(tz: string, d: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { day: String(parts["weekday"]).toLowerCase().slice(0, 3), hour: Number(parts["hour"]) % 24 };
}

type Agent = { id: string; workspace_id: string; status: string; mailbox_status: string; daily_send_cap: number; send_days: number[]; send_start_hour: number; send_end_hour: number; send_timezone: string; warmup_enabled: boolean; warmup_start_cap: number; warmup_increment: number; created_at: string };

function capFor(a: Agent) {
  if (!a.warmup_enabled) return a.daily_send_cap;
  const days = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
  return Math.min(a.daily_send_cap, a.warmup_start_cap + days * a.warmup_increment);
}

export async function slackAlert(admin: Admin, ws: string, text: string) {
  const s = await integration(admin, ws, "slack");
  if (s) await fetch(s.secret, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
}

/** Processes due scheduled messages. Returns counts. */
export async function runDue(admin: Admin, limit = 50) {
  const now = new Date();
  const { data: due } = await admin.from("messages")
    .select("id,channel,subject,body,workspace_id,campaign_id,campaign_lead_id,campaign:campaigns(status,agent_id,language),cl:campaign_leads(status,lead:leads(email,linkedin_url,phone,first_name,last_name,company))")
    .eq("status", "scheduled").lte("scheduled_for", now.toISOString()).order("scheduled_for").limit(limit);
  const out = { sent: 0, waiting: 0, failed: 0, deferred: 0 };
  const agents = new Map<string, Agent | null>();
  const sentToday = new Map<string, number>();
  for (const m of due ?? []) {
    const c = m.campaign as unknown as { status: string; agent_id: string; language: string } | null;
    const cl = m.cl as unknown as { status: string; lead: Record<string, string | null> } | null;
    if (!c || !cl) continue;
    if (c.status !== "active") { out.deferred++; continue; }
    if (cl.status !== "active") { await admin.from("messages").update({ status: "skipped", error: `Lead ${cl.status}` }).eq("id", m.id); continue; }
    if (!agents.has(c.agent_id)) {
      const { data: a } = await admin.from("agents").select("*").eq("id", c.agent_id).eq("workspace_id", m.workspace_id).maybeSingle();
      agents.set(c.agent_id, a as Agent | null);
      const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
      const { data: campIds } = await admin.from("campaigns").select("id").eq("agent_id", c.agent_id);
      const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", start.toISOString()).in("campaign_id", (campIds ?? []).map((x) => x.id));
      sentToday.set(c.agent_id, count ?? 0);
    }
    const a = agents.get(c.agent_id);
    if (!a || a.workspace_id !== m.workspace_id || a.status !== "active") { out.deferred++; continue; }
    const lp = localParts(a.send_timezone || "UTC", now);
    if (!a.send_days.includes(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(lp.day)) || lp.hour < a.send_start_hour || lp.hour >= a.send_end_hour) { out.deferred++; continue; }
    if ((sentToday.get(c.agent_id) ?? 0) >= capFor(a)) { out.deferred++; continue; }
    const l = cl.lead;
    let error: string | null = null, waiting = false;
    try {
      if (m.channel === "email") {
        if (a.mailbox_status !== "connected") { waiting = true; error = "Agent mailbox not connected"; }
        else if (!l["email"]) error = "Lead has no email address";
        else {
          const { sendAgentEmail } = await import("./mailbox-send.server");
          const result = await sendAgentEmail(admin, { workspaceId: m.workspace_id, agentId: a.id, to: l["email"], subject: m.subject ?? "", body: m.body });
          waiting = result.waiting; error = result.error;
        }
      } else if (m.channel === "linkedin") {
        const p = await integration(admin, m.workspace_id, "phantombuster");
        if (!p) { waiting = true; error = "Phantombuster not connected"; }
        else if (!l["linkedin_url"]) error = "Lead has no LinkedIn URL";
        else {
          const r = await fetch("https://api.phantombuster.com/api/v2/agents/launch", { method: "POST", headers: { "X-Phantombuster-Key": p.secret, "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.config["phantom_id"], argument: { profileUrl: l["linkedin_url"], message: m.body } }) });
          if (!r.ok) error = `Phantombuster [${r.status}]: ${(await r.text()).slice(0, 200)}`;
        }
      } else if (m.channel === "call") {
        const v = await integration(admin, m.workspace_id, "vapi");
        const assistant = v ? (c.language === "ar" ? v.config["assistant_ar"] : v.config["assistant_en"]) || v.config["assistant_en"] || v.config["assistant_ar"] : null;
        if (!v || !assistant || !v.config["phone_number_id"]) { waiting = true; error = "Vapi not connected (needs assistant and phone number)"; }
        else if (!l["phone"]) error = "Lead has no phone number";
        else {
          const r = await fetch("https://api.vapi.ai/call", { method: "POST", headers: { Authorization: `Bearer ${v.secret}`, "Content-Type": "application/json" },
            body: JSON.stringify({ assistantId: assistant, phoneNumberId: v.config["phone_number_id"], customer: { number: l["phone"] },
              metadata: { message_id: m.id, campaign_lead_id: m.campaign_lead_id, workspace_id: m.workspace_id },
              assistantOverrides: { variableValues: { first_name: l["first_name"] ?? "", company: l["company"] ?? "", talking_points: m.body },
                server: { url: `${process.env["PUBLIC_APP_URL"] || "https://project--b9731eeb-6ff3-47d5-9a73-e457692f0843.lovable.app"}/api/public/vapi-webhook`, secret: process.env["VAPI_WEBHOOK_SECRET"] ?? "" },
                serverMessages: ["end-of-call-report"] } }) });
          if (!r.ok) error = `Vapi [${r.status}]: ${(await r.text()).slice(0, 200)}`;
        }
      }
    } catch (e) { error = e instanceof Error ? e.message : "Send failed"; }
    if (waiting) { await admin.from("messages").update({ status: "waiting", error }).eq("id", m.id); out.waiting++; }
    else if (error) { await admin.from("messages").update({ status: "failed", error }).eq("id", m.id); out.failed++; }
    else { await admin.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", m.id); sentToday.set(c.agent_id, (sentToday.get(c.agent_id) ?? 0) + 1); out.sent++; }
  }
  return out;
}

/** Posts an event to every active workspace webhook subscribed to it, signed with HMAC-SHA256 (X-Signature header). */
export async function fireWebhooks(admin: Admin, ws: string, event: string, payload: Record<string, unknown>) {
  const { data: hooks } = await admin.from("webhooks").select("id,url,secret,events").eq("workspace_id", ws).eq("active", true);
  for (const h of hooks ?? []) {
    if (!h.events.includes(event)) continue;
    const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
    let status: number | null = null, err: string | null = null;
    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(h.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))).map((b) => b.toString(16).padStart(2, "0")).join("");
      const r = await fetch(h.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Event": event, "X-Signature": `sha256=${sig}` }, body });
      status = r.status; if (!r.ok) err = (await r.text()).slice(0, 200);
    } catch (e) { err = e instanceof Error ? e.message : "Request failed"; }
    await admin.from("webhooks").update({ last_status: status, last_error: err, last_sent_at: new Date().toISOString() }).eq("id", h.id);
  }
}

export const SQL_CLASSES_SERVER = ["interested", "meeting_request"];
const replySchema = {
  type: "object", additionalProperties: false, required: ["classification", "summary"],
  properties: { classification: { type: "string", enum: ["interested", "meeting_request", "question", "not_now", "not_interested", "unsubscribe", "out_of_office", "referral", "other"] }, summary: { type: "string" } },
};

/** Classifies a reply, stops the sequence, pushes SQLs to Freshsales/Slack/webhooks and stores it. Shared by manual logging and the Vapi webhook. */
export async function processReply(admin: Admin, input: { campaignLeadId: string; body: string; channel: string; createdBy: string | null }) {
  const { data: cl } = await admin.from("campaign_leads").select("id,status,campaign_id,lead:leads(*)").eq("id", input.campaignLeadId).single();
  if (!cl) throw new Error("Lead not found");
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", cl.campaign_id).single();
  if (!campaign) throw new Error("Campaign not found");
  const alreadySql = cl.status === "sql";
  const l = cl.lead as unknown as Record<string, string | null>;
  const { getLlmConfig, llmJson } = await import("./llm.server");
  const cfg = await getLlmConfig(campaign.workspace_id, "scoring");
  const out = await llmJson<{ classification: string; summary: string }>(cfg,
    "Classify a prospect's reply (or phone call transcript) to B2B outreach. interested = wants to learn more; meeting_request = proposes or accepts a meeting; not_now = timing; unsubscribe = asks to stop/remove. summary: one sentence.",
    input.body, "reply_class", replySchema);
  const isSql = SQL_CLASSES_SERVER.includes(out.classification);
  let freshsalesId: string | null = null, crmError: string | null = null;
  await admin.from("messages").update({ status: "skipped", error: "Lead replied" }).eq("campaign_lead_id", cl.id).in("status", ["scheduled", "waiting", "approved", "draft"]);
  const leadStatus = out.classification === "unsubscribe" ? "unsubscribed" : isSql || alreadySql ? "sql" : "replied";
  await admin.from("campaign_leads").update({ status: leadStatus }).eq("id", cl.id);
  if (out.classification === "unsubscribe" && l["email"])
    await admin.from("suppression_list").insert({ workspace_id: campaign.workspace_id, value: l["email"].toLowerCase(), kind: "email", reason: "Unsubscribed via reply", created_by: input.createdBy });
  if (isSql && alreadySql) crmError = "Already an SQL — not pushed to Freshsales again";
  if (isSql && !alreadySql) {
    const fs = await integration(admin, campaign.workspace_id, "freshsales");
    if (!fs) crmError = "Freshsales not connected";
    else {
      try {
        const custom: Record<string, string> = {};
        const { data: ag } = await admin.from("agents").select("name").eq("id", campaign.agent_id).single();
        const { data: org } = await admin.from("organizations").select("name").eq("id", campaign.organization_id).single();
        const ours: Record<string, string> = { agent: ag?.name ?? "", brand: org?.name ?? "", campaign: campaign.name, reply_summary: out.summary };
        for (const pair of (fs.config["map_custom_fields"] ?? "").split(",")) { const [k, v] = pair.split("=").map((x) => x.trim()); if (k && v && ours[k] !== undefined) custom[v] = ours[k]!; }
        const contact: Record<string, unknown> = { first_name: l["first_name"], last_name: l["last_name"] || l["company"] || "Unknown", email: l["email"], job_title: l["title"],
          external_id: l["apollo_id"] ?? undefined, ...(fs.config["map_owner_id"] ? { owner_id: Number(fs.config["map_owner_id"]) } : {}), ...(Object.keys(custom).length ? { custom_field: custom } : {}) };
        const domain = fs.config["domain"]!.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const r = await fetch(`https://${domain}/crm/sales/api/contacts`, { method: "POST", headers: { Authorization: `Token token=${fs.secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ contact }) });
        const t = await r.text();
        if (!r.ok) crmError = `Freshsales [${r.status}]: ${t.slice(0, 200)}`;
        else freshsalesId = String((JSON.parse(t) as { contact?: { id?: number } }).contact?.id ?? "");
      } catch (e) { crmError = e instanceof Error ? e.message : "Freshsales push failed"; }
    }
    await slackAlert(admin, campaign.workspace_id, `:fire: New SQL — ${l["first_name"] ?? ""} ${l["last_name"] ?? ""} (${l["title"] ?? ""}, ${l["company"] ?? ""}) replied to "${campaign.name}" via ${input.channel}: ${out.summary}`);
  }
  await admin.from("replies").insert({ workspace_id: campaign.workspace_id, campaign_id: campaign.id, campaign_lead_id: cl.id, channel: input.channel, body: input.body,
    classification: out.classification, summary: out.summary.slice(0, 500), is_sql: isSql, freshsales_id: freshsalesId, crm_error: crmError, created_by: input.createdBy });
  const hook = { campaign: { id: campaign.id, name: campaign.name }, lead: { email: l["email"], first_name: l["first_name"], last_name: l["last_name"], company: l["company"], title: l["title"] },
    channel: input.channel, classification: out.classification, summary: out.summary, freshsales_id: freshsalesId };
  await fireWebhooks(admin, campaign.workspace_id, "reply.received", hook);
  if (isSql && !alreadySql) await fireWebhooks(admin, campaign.workspace_id, "sql.created", hook);
  return { classification: out.classification, isSql, crmError };
}
