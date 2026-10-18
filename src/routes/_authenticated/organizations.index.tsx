import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/organizations/")({
  head: () => ({ meta: [{ title: "Organizations — Outreach AI" }, { name: "description", content: "Brands and the documents your agents learn from." }] }),
  component: OrgList,
});

function OrgList() {
  const { current } = useWorkspace();
  const ws = current?.workspace_id;
  const canCreate = current?.role !== "viewer";
  const q = useQuery({
    queryKey: ["orgs", ws],
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,industry,website,summary_status,documents(count)")
        .eq("workspace_id", ws!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Brands your agents represent, and the documents they learn from."
        actions={canCreate && <NewOrgDialog />}
      />
      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : q.error ? (
        <p className="text-destructive">{(q.error as Error).message}</p>
      ) : !q.data?.length ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-soft">
          <Building2 className="mx-auto size-10 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">No organizations yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create your first brand, then upload its company profile, certifications and rate card.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {q.data.map((o) => {
            const count = (o.documents as unknown as { count: number }[])[0]?.count ?? 0;
            return (
              <Link key={o.id} to="/organizations/$orgId" params={{ orgId: o.id }}
                className="rounded-2xl bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/30">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-lavender font-display font-semibold text-primary">
                    {o.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{o.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{o.industry || o.website || "—"}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 text-xs">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5">{count} document{count === 1 ? "" : "s"}</span>
                  <SummaryChip status={o.summary_status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SummaryChip({ status }: { status: string }) {
  if (status === "approved") return <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-success">Knowledge approved</span>;
  if (status === "draft") return <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-warning">Needs review</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">No summary</span>;
}

function NewOrgDialog() {
  const { current, user } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", website: "", industry: "", description: "", languages: "English, Arabic", signature: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        workspace_id: current!.workspace_id,
        created_by: user.id,
        name: f.name.trim(),
        website: f.website || null,
        industry: f.industry || null,
        description: f.description || null,
        signature: f.signature || null,
        languages: f.languages.split(",").map((s) => s.trim()).filter(Boolean),
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Organization created");
    setOpen(false);
    navigate({ to: "/organizations/$orgId", params: { orgId: data.id } });
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> New organization</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New organization</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input required value={f.name} onChange={set("name")} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Website</Label><Input value={f.website} onChange={set("website")} placeholder="https://" /></div>
            <div className="space-y-1.5"><Label>Industry</Label><Input value={f.industry} onChange={set("industry")} /></div>
          </div>
          <div className="space-y-1.5"><Label>Short description</Label><Textarea rows={3} value={f.description} onChange={set("description")} /></div>
          <div className="space-y-1.5"><Label>Default languages (comma separated)</Label><Input value={f.languages} onChange={set("languages")} /></div>
          <div className="space-y-1.5"><Label>Default sender signature</Label><Textarea rows={3} value={f.signature} onChange={set("signature")} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
