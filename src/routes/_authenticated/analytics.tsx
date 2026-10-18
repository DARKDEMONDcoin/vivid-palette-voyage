import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/lib/workspace";
import { pct, useAnalytics, type Stats } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Outreach AI" }, { name: "description", content: "Which agents and campaigns perform best." }] }),
  component: Analytics,
});

function Funnel({ s }: { s: Stats }) {
  const rows = [["Leads added", s.leads], ["Qualified", s.qualified], ["Touches sent", s.sent], ["Replies", s.replies], ["Interested", s.interested], ["SQLs", s.sqls]] as const;
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="space-y-2">
      {rows.map(([l, v]) => (
        <div key={l} className="flex items-center gap-3 text-sm">
          <span className="w-28 text-muted-foreground">{l}</span>
          <div className="h-6 flex-1 rounded bg-muted"><div className="h-6 rounded bg-brand-gradient" style={{ width: `${(v / max) * 100}%` }} /></div>
          <span className="w-12 text-right font-medium">{v}</span>
        </div>))}
    </div>
  );
}

function Table({ rows }: { rows: { key: string; name: string; s: Stats }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No activity in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr>{["Name", "Leads", "Sent", "Email", "LinkedIn", "Call", "Replies", "Reply rate", "Interested", "SQLs", "SQL rate"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(({ key, name, s }) => (
          <tr key={key} className="border-t">
            <td className="px-2 py-2 font-medium">{name}</td><td className="px-2">{s.leads}</td><td className="px-2">{s.sent}</td>
            <td className="px-2">{s.email}</td><td className="px-2">{s.linkedin}</td><td className="px-2">{s.call}</td>
            <td className="px-2">{s.replies}</td><td className="px-2">{pct(s.replies, s.sent)}</td><td className="px-2">{s.interested}</td>
            <td className="px-2 font-semibold text-warning">{s.sqls}</td><td className="px-2">{pct(s.sqls, s.leads)}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

function Analytics() {
  const { current } = useWorkspace();
  const [days, setDays] = useState("30");
  const q = useAnalytics(current?.workspace_id, Number(days));
  const d = q.data;
  const card = "rounded-2xl bg-card p-6 shadow-soft";
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Which agents and campaigns perform best."
        actions={<Select value={days} onValueChange={setDays}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["7", "30", "90"].map((v) => <SelectItem key={v} value={v}>Last {v} days</SelectItem>)}</SelectContent></Select>} />
      {!d ? <Skeleton className="h-96" /> : (<>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[["Touches sent", d.total.sent], ["Reply rate", pct(d.total.replies, d.total.sent)], ["Interest rate", pct(d.total.interested, d.total.replies)], ["SQLs", d.total.sqls], ["Unsubscribe rate", pct(d.total.unsub, d.total.sent)]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-card p-5 shadow-soft"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-2 font-display text-3xl font-semibold">{v}</p></div>))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={card}><h2 className="mb-4 text-lg font-semibold">Funnel</h2><Funnel s={d.total} /></div>
          <div className={card}><h2 className="mb-4 text-lg font-semibold">Daily activity</h2>
            <div className="h-64"><ResponsiveContainer><AreaChart data={d.series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="day" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip />
              <Area dataKey="sent" name="Sent" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} />
              <Area dataKey="replies" name="Replies" stroke="var(--warning)" fill="var(--warning)" fillOpacity={0.3} />
            </AreaChart></ResponsiveContainer></div></div>
        </div>
        <div className={card}><h2 className="mb-4 text-lg font-semibold">Agents</h2>
          <Table rows={d.agents.map((a) => ({ key: a.id, name: a.name, s: d.byAgent.get(a.id) })).filter((r): r is { key: string; name: string; s: Stats } => !!r.s).sort((a, b) => b.s.sqls - a.s.sqls)} /></div>
        <div className={card}><h2 className="mb-4 text-lg font-semibold">Campaigns</h2>
          <Table rows={d.campaigns.map((c) => ({ key: c.id, name: c.name, s: d.byCampaign.get(c.id) })).filter((r): r is { key: string; name: string; s: Stats } => !!r.s).sort((a, b) => b.s.sqls - a.s.sqls)} /></div>
        <div className={card}><h2 className="mb-1 text-lg font-semibold">A/B tests</h2><p className="mb-4 text-sm text-muted-foreground">Replies are credited to the variant the lead first received.</p>
          <Table rows={d.campaigns.filter((c) => c.ab_testing).flatMap((c) => ["A", "B"].map((v) => ({ key: `${c.id}:${v}`, name: `${c.name} — Variant ${v}`, s: d.byVariant.get(`${c.id}:${v}`) })))
            .filter((r): r is { key: string; name: string; s: Stats } => !!r.s)} /></div>
        <p className="text-xs text-muted-foreground">Cost per SQL needs provider billing data and isn't tracked yet.</p>
      </>)}
    </div>
  );
}
