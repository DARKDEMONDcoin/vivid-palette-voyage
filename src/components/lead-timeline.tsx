import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/external/client";
import { ChannelChip } from "@/components/campaign-launch";

type Item = { at: string; kind: "message" | "reply"; channel: string; title: string; body: string; meta: string; campaign: string };

/** Chronological history for one lead across all campaigns: steps sent/scheduled and replies. */
export function LeadTimeline({ leadId }: { leadId: string }) {
  const q = useQuery({
    queryKey: ["lead-timeline", leadId],
    queryFn: async () => {
      const { data: cls, error } = await supabase.from("campaign_leads").select("id,status,score,decision,campaign:campaigns(name)").eq("lead_id", leadId);
      if (error) throw error;
      const ids = (cls ?? []).map((c) => c.id);
      const name = new Map((cls ?? []).map((c) => [c.id, (c.campaign as unknown as { name: string } | null)?.name ?? "—"]));
      if (!ids.length) return { cls: cls ?? [], items: [] as Item[] };
      const [m, r] = await Promise.all([
        supabase.from("messages").select("campaign_lead_id,channel,subject,body,status,step_order,sent_at,scheduled_for,created_at,error").in("campaign_lead_id", ids),
        supabase.from("replies").select("campaign_lead_id,channel,body,classification,summary,is_sql,created_at").in("campaign_lead_id", ids),
      ]);
      const items: Item[] = [
        ...(m.data ?? []).filter((x) => x.status !== "draft" && x.status !== "rejected").map((x) => ({ at: x.sent_at ?? x.scheduled_for ?? x.created_at, kind: "message" as const, channel: x.channel,
          title: `Step ${x.step_order}${x.subject ? ` — ${x.subject}` : ""}`, body: x.body, meta: x.status + (x.error ? ` · ${x.error}` : ""), campaign: name.get(x.campaign_lead_id) ?? "" })),
        ...(r.data ?? []).map((x) => ({ at: x.created_at, kind: "reply" as const, channel: x.channel, title: `Reply · ${x.classification?.replace("_", " ") ?? "unclassified"}${x.is_sql ? " · SQL" : ""}`,
          body: x.body, meta: x.summary ?? "", campaign: name.get(x.campaign_lead_id) ?? "" })),
      ].sort((a, b) => a.at.localeCompare(b.at));
      return { cls: cls ?? [], items };
    },
  });
  if (q.isLoading) return <Skeleton className="h-32" />;
  const d = q.data!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {d.cls.map((c) => (
          <span key={c.id} className="rounded-full bg-muted px-3 py-1 text-xs">
            {(c.campaign as unknown as { name: string } | null)?.name}: {c.status === "sql" ? "SQL" : c.status} · {c.decision.replace("_", " ")}{c.score ? ` · score ${c.score}` : ""}
          </span>))}
        {!d.cls.length && <p className="text-sm text-muted-foreground">Not in any campaign you can see.</p>}
      </div>
      {!d.items.length ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
        <ol className="space-y-3 border-l pl-4">
          {d.items.map((i, k) => (
            <li key={k} className="relative">
              <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ${i.kind === "reply" ? "bg-warning" : "bg-primary"}`} />
              <div className="flex flex-wrap items-center gap-2 text-sm"><ChannelChip ch={i.channel} /><b>{i.title}</b>
                <span className="text-xs text-muted-foreground">{i.campaign} · {new Date(i.at).toLocaleString()}</span></div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{i.body.slice(0, 600)}</p>
              {i.meta && <p className="text-xs text-muted-foreground">{i.meta}</p>}
            </li>))}
        </ol>)}
    </div>
  );
}
