import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";

export type LeadInput = {
  email?: string | undefined; first_name?: string | undefined; last_name?: string | undefined; title?: string | undefined;
  seniority?: string | undefined; company?: string | undefined; company_domain?: string | undefined; website?: string | undefined;
  company_size?: string | undefined; industry?: string | undefined; country?: string | undefined; city?: string | undefined;
  language?: string | undefined; linkedin_url?: string | undefined; phone?: string | undefined; apollo_id?: string | undefined;
};
export const LEAD_FIELDS: (keyof LeadInput)[] = ["email", "first_name", "last_name", "title", "seniority", "company", "company_domain", "website", "company_size", "industry", "country", "city", "language", "linkedin_url", "phone"];

export type ApolloFilters = { titles: string[]; seniorities: string[]; industries: string[]; locations: string[]; sizes: string[]; keywords: string };

type Rpc = (fn: string, args: object) => Promise<{ data: unknown; error: unknown }>;

async function assertEdit(supabase: unknown, campaignId: string) {
  const { data, error } = await ((supabase as { rpc: Rpc }).rpc)("can_edit_campaign", { _c: campaignId });
  if (error || data !== true) throw new Error("You can't edit this campaign");
  const { supabaseAdmin } = await import("@/integrations/external/client.server");
  const { data: c } = await supabaseAdmin.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c) throw new Error("Campaign not found");
  return { admin: supabaseAdmin, campaign: c };
}

const clean = (v: unknown, n = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

async function addLeads(admin: Awaited<ReturnType<typeof assertEdit>>["admin"], campaign: { id: string; workspace_id: string; created_by: string }, rows: LeadInput[], source: string, userId: string) {
  const ws = campaign.workspace_id;
  const { data: org } = await admin.from("campaigns").select("organization_id").eq("id", campaign.id).single();
  const { data: supp0 } = await admin.from("suppression_list").select("kind,value,organization_id").eq("workspace_id", ws);
  const supp = (supp0 ?? []).filter((s) => !s.organization_id || s.organization_id === org?.organization_id);
  const suppEmails = new Set((supp ?? []).filter((s) => s.kind === "email").map((s) => s.value.toLowerCase()));
  const suppDomains = new Set((supp ?? []).filter((s) => s.kind === "domain").map((s) => s.value.toLowerCase()));
  let suppressed = 0, invalid = 0, duplicates = 0;
  const seen = new Set<string>();
  const good: LeadInput[] = [];
  for (const r of rows) {
    const email = clean(r.email, 200)?.toLowerCase() ?? null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { invalid++; continue; }
    if (!email && !clean(r.linkedin_url) && !clean(r.phone)) { invalid++; continue; }
    if (email && (suppEmails.has(email) || suppDomains.has(email.split("@")[1]!))) { suppressed++; continue; }
    if (email) { if (seen.has(email)) { duplicates++; continue; } seen.add(email); }
    good.push({ ...r, email: email ?? undefined });
  }
  const emails = good.map((g) => g.email).filter(Boolean) as string[];
  const existing = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await admin.from("leads").select("id,email").eq("workspace_id", ws).in("email", emails.slice(i, i + 200));
    for (const l of data ?? []) if (l.email) existing.set(l.email.toLowerCase(), l.id);
  }
  const toInsert = good.filter((g) => !g.email || !existing.has(g.email)).map((g) => {
    const o: Record<string, unknown> = { workspace_id: ws, source, created_by: userId };
    for (const f of LEAD_FIELDS) o[f] = clean(g[f]);
    o["apollo_id"] = clean(g.apollo_id);
    return o;
  });
  const leadIds: string[] = good.filter((g) => g.email && existing.has(g.email)).map((g) => existing.get(g.email!)!);
  for (let i = 0; i < toInsert.length; i += 200) {
    const { data, error } = await admin.from("leads").insert(toInsert.slice(i, i + 200) as never).select("id");
    if (error) throw new Error(error.message);
    leadIds.push(...(data ?? []).map((d) => d.id));
  }
  const { data: already } = await admin.from("campaign_leads").select("lead_id").eq("campaign_id", campaign.id);
  const inCampaign = new Set((already ?? []).map((a) => a.lead_id));
  const link = leadIds.filter((id) => { if (inCampaign.has(id)) { duplicates++; return false; } inCampaign.add(id); return true; });
  for (let i = 0; i < link.length; i += 500) {
    const { error } = await admin.from("campaign_leads").insert(link.slice(i, i + 500).map((lead_id) => ({ campaign_id: campaign.id, lead_id, workspace_id: ws })));
    if (error) throw new Error(error.message);
  }
  return { added: link.length, duplicates, suppressed, invalid };
}

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; rows: LeadInput[] }) => {
    if (!d?.campaignId || !Array.isArray(d.rows) || d.rows.length > 5000) throw new Error("Invalid input (max 5,000 rows per import)");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    return addLeads(admin, campaign, data.rows, "file", context.userId);
  });

async function apolloKey(admin: Awaited<ReturnType<typeof assertEdit>>["admin"], ws: string) {
  const { data: row } = await admin.from("integrations").select("id,status").eq("workspace_id", ws).eq("provider", "apollo").maybeSingle();
  if (!row || row.status !== "connected") throw new Error("Apollo is not connected. A Super Admin can connect it on the Integrations page.");
  const { data: s } = await admin.from("integration_secrets").select("secret").eq("integration_id", row.id).maybeSingle();
  if (!s?.secret) throw new Error("Apollo key missing — reconnect Apollo.");
  return s.secret;
}

function apolloParams(f: ApolloFilters, page: number, perPage: number) {
  const p = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  f.titles.forEach((t) => p.append("person_titles[]", t));
  f.seniorities.forEach((t) => p.append("person_seniorities[]", t));
  f.locations.forEach((t) => p.append("person_locations[]", t));
  f.sizes.forEach((t) => p.append("organization_num_employees_ranges[]", t));
  const kw = [f.keywords, ...f.industries].filter(Boolean).join(" ").trim();
  if (kw) p.set("q_keywords", kw);
  return p;
}

async function apolloFetch(key: string, path: string, init: { query?: URLSearchParams; body?: unknown }) {
  const url = `https://api.apollo.io/api/v1/${path}${init.query ? `?${init.query}` : ""}`;
  const res = await fetch(url, { method: "POST", headers: { "X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" }, body: init.body ? JSON.stringify(init.body) : null });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403 && text.includes("API_INACCESSIBLE")) throw new Error("Your Apollo key can't use people search. Use a master API key (Apollo → Settings → Integrations → API).");
    throw new Error(`Apollo error [${res.status}]: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

const validateFilters = (d: { campaignId: string; filters: ApolloFilters; limit?: number }) => {
  if (!d?.campaignId || !d.filters) throw new Error("Invalid input");
  const arr = (a: unknown) => (Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, 30) : []);
  const f = d.filters;
  return { campaignId: d.campaignId, limit: Math.min(Math.max(Number(d.limit) || 25, 1), 100),
    filters: { titles: arr(f.titles), seniorities: arr(f.seniorities), industries: arr(f.industries), locations: arr(f.locations), sizes: arr(f.sizes), keywords: String(f.keywords ?? "").slice(0, 200) } };
};

export const apolloPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFilters)
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    const key = await apolloKey(admin, campaign.workspace_id);
    const j = await apolloFetch(key, "mixed_people/api_search", { query: apolloParams(data.filters, 1, 1) });
    const total = Number((j["pagination"] as { total_entries?: number } | undefined)?.total_entries ?? j["total_entries"] ?? 0);
    return { total };
  });

type ApolloPerson = { id: string; first_name?: string; last_name?: string; title?: string; seniority?: string; email?: string; linkedin_url?: string; city?: string; country?: string;
  organization?: { name?: string; primary_domain?: string; website_url?: string; estimated_num_employees?: number; industry?: string } };

export const apolloImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFilters)
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    const key = await apolloKey(admin, campaign.workspace_id);
    const j = await apolloFetch(key, "mixed_people/api_search", { query: apolloParams(data.filters, 1, data.limit) });
    const people = ((j["people"] as { id: string }[] | undefined) ?? []).slice(0, data.limit);
    const rows: LeadInput[] = [];
    let unmatched = 0;
    for (let i = 0; i < people.length; i += 10) {
      const e = await apolloFetch(key, "people/bulk_match", { body: { details: people.slice(i, i + 10).map((p) => ({ id: p.id })), reveal_personal_emails: false } });
      for (const m of (e["matches"] as (ApolloPerson | null)[] | undefined) ?? []) {
        if (!m) { unmatched++; continue; }
        const o = m.organization ?? {};
        rows.push({ apollo_id: m.id, email: m.email, first_name: m.first_name, last_name: m.last_name, title: m.title, seniority: m.seniority, linkedin_url: m.linkedin_url,
          city: m.city, country: m.country, company: o.name, company_domain: o.primary_domain, website: o.website_url, industry: o.industry,
          company_size: o.estimated_num_employees ? String(o.estimated_num_employees) : undefined });
      }
    }
    const r = await addLeads(admin, campaign, rows, "apollo", context.userId);
    return { ...r, fetched: people.length, unmatched, credits: people.length };
  });

// ---------- Qualification ----------
const qualSchema = {
  type: "object", additionalProperties: false,
  required: ["size_score", "fit_score", "multilingual_score", "reasoning", "signals"],
  properties: {
    size_score: { type: "integer" }, fit_score: { type: "integer" }, multilingual_score: { type: "integer" },
    reasoning: { type: "string" }, signals: { type: "array", items: { type: "string" } },
  },
};

async function brandContext(admin: Awaited<ReturnType<typeof assertEdit>>["admin"], orgId: string) {
  const { data: org } = await admin.from("organizations").select("name,industry,description,summary,summary_status").eq("id", orgId).single();
  return `Brand: ${org?.name}\nIndustry: ${org?.industry ?? "-"}\nDescription: ${org?.description ?? "-"}\nApproved brand summary: ${org?.summary_status === "approved" ? JSON.stringify(org.summary) : "not approved yet"}`;
}

export const qualifyLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; ids: string[] }) => {
    if (!d?.campaignId || !Array.isArray(d.ids) || d.ids.length > 5) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    const { getLlmConfig, llmJson, fetchPage, siteUrl } = await import("./llm.server");
    const cfg = await getLlmConfig(campaign.workspace_id, "scoring");
    const brand = await brandContext(admin, campaign.organization_id);
    const w = campaign.qualification_weights as { size: number; fit: number; multilingual: number };
    const total = Math.max(1, w.size + w.fit + w.multilingual);
    const { data: rows } = await admin.from("campaign_leads").select("id,decision_overridden,lead:leads(*)").eq("campaign_id", campaign.id).in("id", data.ids);
    const results = await Promise.all((rows ?? []).map(async (r) => {
      const l = r.lead as unknown as Record<string, string | null>;
      try {
        const url = siteUrl(l["website"] ?? null, l["company_domain"] ?? null);
        const page = url ? await fetchPage(url) : null;
        const langLinks = page ? page.links.filter((h) => /\/(ar|en|fr|de|es|it|zh|ja|ru|pt|tr|nl)(\/|$)|[?&]lang=/i.test(h)).slice(0, 10) : [];
        const input = `${brand}\n\nLead:\n${JSON.stringify({ name: `${l["first_name"] ?? ""} ${l["last_name"] ?? ""}`.trim(), title: l["title"], seniority: l["seniority"], company: l["company"], size: l["company_size"], industry: l["industry"], country: l["country"], city: l["city"] })}\n\nWebsite: ${page ? page.url : "could not be fetched"}\nhreflang versions: ${page?.hreflangs.join(", ") || "none"}\nLanguage links: ${langLinks.join(", ") || "none"}\nHomepage text:\n${page?.text.slice(0, 6000) ?? "-"}`;
        const out = await llmJson<{ size_score: number; fit_score: number; multilingual_score: number; reasoning: string; signals: string[] }>(cfg,
          "You qualify B2B leads for a sales team. Score 1-10 each: size_score (company size suitability for the brand), fit_score (how well the company's business fits the brand's offering), multilingual_score (multiple language versions of the website, multiple locations/offices = strong positive). Use only the given facts; if information is missing, score conservatively (around 4) and say so. reasoning: 1-2 sentences. signals: short concrete facts you found.",
          input, "qualification", qualSchema);
        const c = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
        const score = c((c(out.size_score) * w.size + c(out.fit_score) * w.fit + c(out.multilingual_score) * w.multilingual) / total);
        const upd: Record<string, unknown> = { score, reasoning: out.reasoning.slice(0, 1000), signals: [...out.signals.slice(0, 10), ...(page ? [`Source: ${page.url}`] : [])], qualify_error: null };
        if (!r.decision_overridden) upd["decision"] = score >= campaign.qualification_threshold ? "qualified" : "not_qualified";
        await admin.from("campaign_leads").update(upd as never).eq("id", r.id);
        return { id: r.id, ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        await admin.from("campaign_leads").update({ qualify_error: msg.slice(0, 500) }).eq("id", r.id);
        return { id: r.id, ok: false, error: msg };
      }
    }));
    return { results };
  });

// ---------- Deep research ----------
const researchSchema = {
  type: "object", additionalProperties: false,
  required: ["company_overview", "products_services", "markets", "contact_role", "likely_responsibilities", "recent_news", "personalization_hooks", "sources"],
  properties: {
    company_overview: { type: "string" },
    products_services: { type: "array", items: { type: "string" } },
    markets: { type: "array", items: { type: "string" } },
    contact_role: { type: "string" },
    likely_responsibilities: { type: "array", items: { type: "string" } },
    recent_news: { type: "array", items: { type: "object", additionalProperties: false, required: ["headline", "url"], properties: { headline: { type: "string" }, url: { type: "string" } } } },
    personalization_hooks: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
  },
};
export type ResearchProfile = {
  company_overview: string; products_services: string[]; markets: string[]; contact_role: string; likely_responsibilities: string[];
  recent_news: { headline: string; url: string }[]; personalization_hooks: string[]; sources: string[];
};

export const researchLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; ids: string[] }) => {
    if (!d?.campaignId || !Array.isArray(d.ids) || d.ids.length > 3) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { admin, campaign } = await assertEdit(context.supabase, data.campaignId);
    const { getLlmConfig, llmJson, fetchPage, siteUrl } = await import("./llm.server");
    const cfg = await getLlmConfig(campaign.workspace_id, "research");
    const brand = await brandContext(admin, campaign.organization_id);
    const { data: rows } = await admin.from("campaign_leads").select("id,decision,lead:leads(*)").eq("campaign_id", campaign.id).eq("decision", "qualified").in("id", data.ids);
    const results = await Promise.all((rows ?? []).map(async (r) => {
      const l = r.lead as unknown as Record<string, string | null>;
      try {
        const url = siteUrl(l["website"] ?? null, l["company_domain"] ?? null);
        const pages: { url: string; text: string }[] = [];
        const home = url ? await fetchPage(url) : null;
        if (home) {
          pages.push(home);
          const host = new URL(home.url).host;
          const pick = (re: RegExp) => home.links.find((h) => { try { return new URL(h).host === host && re.test(h); } catch { return false; } });
          const extra = [pick(/about|who-we-are|company/i), pick(/news|blog|press|media|insights/i)].filter((x): x is string => !!x);
          for (const p of await Promise.all(extra.map((u) => fetchPage(u)))) if (p) pages.push(p);
        }
        const fetched = pages.map((p) => p.url);
        const input = `${brand}\n\nLead: ${JSON.stringify({ name: `${l["first_name"] ?? ""} ${l["last_name"] ?? ""}`.trim(), title: l["title"], seniority: l["seniority"], company: l["company"], industry: l["industry"], country: l["country"], linkedin: l["linkedin_url"] })}\n\n` +
          (pages.length ? pages.map((p) => `PAGE ${p.url}\n${p.text.slice(0, 5000)}`).join("\n\n") : "No website pages could be fetched.");
        const out = await llmJson<ResearchProfile>(cfg,
          "You research a B2B prospect so a sales email can be personalized. Use ONLY the provided pages and lead data; never invent facts, news or numbers. recent_news: only items visible on the provided pages, with the page URL; empty if none. contact_role: what this person likely owns given their title. personalization_hooks: 2-4 specific angles connecting the prospect to the brand's offering. sources: URLs you used (from the provided pages only).",
          input, "research_profile", researchSchema);
        out.sources = out.sources.filter((s) => fetched.includes(s) || s === l["linkedin_url"]);
        if (!out.sources.length) out.sources = fetched;
        out.recent_news = out.recent_news.filter((n) => fetched.includes(n.url));
        await admin.from("campaign_leads").update({ research: out as never, research_status: "done", research_error: null }).eq("id", r.id);
        return { id: r.id, ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        await admin.from("campaign_leads").update({ research_status: "failed", research_error: msg.slice(0, 500) }).eq("id", r.id);
        return { id: r.id, ok: false, error: msg };
      }
    }));
    return { results };
  });
