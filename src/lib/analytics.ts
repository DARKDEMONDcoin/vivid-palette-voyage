import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/external/client";

export type Stats = { leads: number; qualified: number; sent: number; email: number; linkedin: number; call: number; replies: number; interested: number; sqls: number; unsub: number };
const empty = (): Stats => ({ leads: 0, qualified: 0, sent: 0, email: 0, linkedin: 0, call: 0, replies: 0, interested: 0, sqls: 0, unsub: 0 });

type Msg = { campaign_id: string; campaign_lead_id: string; channel: string; variant: string; status: string; sent_at: string | null };
type Rep = { campaign_id: string; campaign_lead_id: string; classification: string | null; is_sql: boolean; created_at: string };
type CL = { id: string; campaign_id: string; decision: string; created_at: string };

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await build(i * 1000, i * 1000 + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

/** Loads workspace activity since `days` ago and aggregates it overall, per campaign, per agent, per variant and per day. */
export function useAnalytics(ws: string | undefined, days: number) {
  return useQuery({
    enabled: !!ws,
    queryKey: ["analytics", ws, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [camps, agents, msgs, reps, cls] = await Promise.all([
        supabase.from("campaigns").select("id,name,status,agent_id,ab_testing").eq("workspace_id", ws!),
        supabase.from("agents").select("id,name,status").eq("workspace_id", ws!),
        all<Msg>((a, b) => supabase.from("messages").select("campaign_id,campaign_lead_id,channel,variant,status,sent_at").eq("workspace_id", ws!).eq("status", "sent").gte("sent_at", since).range(a, b)),
        all<Rep>((a, b) => supabase.from("replies").select("campaign_id,campaign_lead_id,classification,is_sql,created_at").eq("workspace_id", ws!).gte("created_at", since).range(a, b)),
        all<CL>((a, b) => supabase.from("campaign_leads").select("id,campaign_id,decision,created_at").eq("workspace_id", ws!).gte("created_at", since).range(a, b)),
      ]);
      const campaigns = camps.data ?? [], agentList = agents.data ?? [];
      const agentOf = new Map(campaigns.map((c) => [c.id, c.agent_id]));
      const total = empty();
      const byCampaign = new Map<string, Stats>(), byAgent = new Map<string, Stats>(), byVariant = new Map<string, Stats>();
      const daily = new Map<string, { sent: number; replies: number }>();
      const variantOfLead = new Map<string, string>();
      const get = (m: Map<string, Stats>, k: string) => { let s = m.get(k); if (!s) m.set(k, (s = empty())); return s; };
      const bump = (c: string, f: (s: Stats) => void, variant?: string) => {
        f(total); f(get(byCampaign, c)); f(get(byAgent, agentOf.get(c) ?? "?"));
        if (variant) f(get(byVariant, `${c}:${variant}`));
      };
      const day = (d: string) => { const k = d.slice(0, 10); let v = daily.get(k); if (!v) daily.set(k, (v = { sent: 0, replies: 0 })); return v; };
      for (const l of cls) bump(l.campaign_id, (s) => { s.leads++; if (l.decision === "qualified") s.qualified++; });
      for (const m of msgs) {
        if (!variantOfLead.has(m.campaign_lead_id)) variantOfLead.set(m.campaign_lead_id, m.variant);
        bump(m.campaign_id, (s) => { s.sent++; if (m.channel === "email" || m.channel === "linkedin" || m.channel === "call") s[m.channel]++; }, m.variant);
        if (m.sent_at) day(m.sent_at).sent++;
      }
      // Interested/SQL/unsubscribe count each lead once, even if they reply several times.
      const seen = new Set<string>();
      const once = (k: string) => (seen.has(k) ? false : (seen.add(k), true));
      for (const r of reps) {
        const interested = (r.classification === "interested" || r.classification === "meeting_request" || r.is_sql) && once(`i:${r.campaign_lead_id}`);
        const sql = r.is_sql && once(`s:${r.campaign_lead_id}`);
        const unsub = r.classification === "unsubscribe" && once(`u:${r.campaign_lead_id}`);
        bump(r.campaign_id, (s) => { s.replies++; if (interested) s.interested++; if (sql) s.sqls++; if (unsub) s.unsub++; }, variantOfLead.get(r.campaign_lead_id));
        day(r.created_at).replies++;
      }
      const series = Array.from({ length: days }, (_, i) => {
        const k = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return { day: k.slice(5), ...(daily.get(k) ?? { sent: 0, replies: 0 }) };
      });
      return { total, campaigns, agents: agentList, byCampaign, byAgent, byVariant, series };
    },
  });
}
