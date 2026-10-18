import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, RefreshCw, Sparkles, Trash2, Upload, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { ACCEPTED_EXT, extractText } from "@/lib/parse-document";
import { generateSummary, indexDocument, type BrandSummary } from "@/lib/knowledge.functions";
import { SummaryChip } from "./organizations.index";

export const Route = createFileRoute("/_authenticated/organizations/$orgId")({
  head: () => ({ meta: [{ title: "Organization — Outreach AI" }, { name: "description", content: "Brand profile, documents and AI knowledge." }] }),
  component: OrgDetail,
});

export const DOC_TYPES = ["Company profile", "ISO/Certification", "Rate card", "Language support list", "Case study", "Pitch deck", "Other"];

function OrgDetail() {
  const { orgId } = Route.useParams();
  const { current } = useWorkspace();
  const q = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!q.data) return <p className="text-muted-foreground">Organization not found or you don't have access.</p>;
  const org = q.data;
  const canEdit = current?.role !== "viewer";

  return (
    <div>
      <Link to="/organizations" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Organizations
      </Link>
      <PageHeader title={org.name} description={org.industry ?? org.website ?? ""} actions={<SummaryChip status={org.summary_status} />} />
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="knowledge">What the AI knows</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {current?.role === "super_admin" && <TabsTrigger value="access">Access</TabsTrigger>}
        </TabsList>
        <TabsContent value="documents"><Documents orgId={org.id} canEdit={canEdit} /></TabsContent>
        <TabsContent value="knowledge"><Knowledge org={org} canEdit={canEdit} /></TabsContent>
        <TabsContent value="profile"><Profile org={org} canEdit={canEdit} /></TabsContent>
        {current?.role === "super_admin" && <TabsContent value="access"><Access orgId={org.id} /></TabsContent>}
      </Tabs>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-2xl bg-card p-6 shadow-soft">{children}</div>;
}

const statusTone: Record<string, string> = {
  uploaded: "bg-sky text-info",
  parsing: "bg-lavender text-primary",
  indexed: "bg-success/15 text-success",
  failed: "bg-destructive/10 text-destructive",
};

function fmtSize(b: number) {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

function Documents({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { current, user } = useWorkspace();
  const qc = useQueryClient();
  const index = useServerFn(indexDocument);
  const [docType, setDocType] = useState<string>("");
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const docs = useQuery({
    queryKey: ["docs", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set(data.map((d) => d.uploaded_by))];
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      return data.map((d) => ({ ...d, uploader: profs?.find((p) => p.id === d.uploaded_by)?.full_name ?? "—" }));
    },
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "parsing") ? 3000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["docs", orgId] });

  async function runIndex(docId: string, blob: Blob, name: string) {
    await supabase.from("documents").update({ status: "parsing", error: null }).eq("id", docId);
    refresh();
    let text: string;
    try {
      text = await extractText(blob, name);
    } catch (e) {
      await supabase.from("documents").update({ status: "failed", error: (e as Error).message }).eq("id", docId);
      return { ok: false, error: (e as Error).message };
    }
    return await index({ data: { documentId: docId, text } });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!docType) { toast.error("Choose a document type first"); return; }
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      const file = list[i]!;
      setProgress(`Processing ${i + 1} of ${list.length}: ${file.name}`);
      const path = `${orgId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("org-files").upload(path, file, file.type ? { contentType: file.type } : {});
      if (up.error) { toast.error(`${file.name}: ${up.error.message}`); continue; }
      const { data: doc, error } = await supabase.from("documents").insert({
        organization_id: orgId, workspace_id: current!.workspace_id, doc_type: docType,
        file_name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size, uploaded_by: user.id,
      }).select("id").single();
      if (error) { toast.error(error.message); continue; }
      refresh();
      const res = await runIndex(doc.id, file, file.name);
      res.ok ? toast.success(`${file.name} indexed`) : toast.error(`${file.name}: ${"error" in res ? res.error : "failed"}`);
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  async function reindex(d: { id: string; storage_path: string; file_name: string }) {
    setProgress(`Re-indexing ${d.file_name}`);
    const { data: blob, error } = await supabase.storage.from("org-files").download(d.storage_path);
    if (error || !blob) { toast.error(error?.message ?? "Download failed"); setProgress(null); return; }
    const res = await runIndex(d.id, blob, d.file_name);
    res.ok ? toast.success("Re-indexed") : toast.error("error" in res ? String(res.error) : "Failed");
    setProgress(null);
    refresh();
  }

  async function remove(d: { id: string; storage_path: string }) {
    if (!confirm("Delete this document and its indexed knowledge?")) return;
    await supabase.storage.from("org-files").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    error ? toast.error(error.message) : toast.success("Deleted");
    refresh();
  }

  return (
    <Panel>
      {canEdit && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-dashed bg-secondary/50 p-4">
          <div className="space-y-1.5">
            <Label>Document type (required)</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED_EXT.join(",")} className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Button onClick={() => (docType ? fileRef.current?.click() : toast.error("Choose a document type first"))} disabled={!!progress}>
            <Upload className="size-4" /> Upload files
          </Button>
          <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, CSV or TXT · up to 25 MB</p>
          {progress && <p className="w-full text-sm text-primary">{progress}…</p>}
        </div>
      )}
      {docs.isLoading ? <Skeleton className="h-24" /> : !docs.data?.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 size-8 text-primary" /> No documents yet. Upload a company profile to get started.
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>File</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
            <TableHead>Size</TableHead><TableHead>Uploaded by</TableHead><TableHead>Date</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {docs.data.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="max-w-56 truncate font-medium">{d.file_name}</TableCell>
                <TableCell>{d.doc_type}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${statusTone[d.status] ?? ""}`} title={d.error ?? ""}>
                    {d.status === "parsing" ? "Parsing" : d.status}{d.status === "indexed" ? ` · ${d.chunk_count}` : ""}
                  </span>
                  {d.status === "failed" && d.error && <div className="mt-1 max-w-56 truncate text-xs text-destructive">{d.error}</div>}
                </TableCell>
                <TableCell>{fmtSize(d.size_bytes)}</TableCell>
                <TableCell>{d.uploader}</TableCell>
                <TableCell>{new Date(d.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {canEdit && <>
                    <Button variant="ghost" size="icon" aria-label="Re-index" disabled={!!progress} onClick={() => reindex(d)}><RefreshCw className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(d)}><Trash2 className="size-4" /></Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

type Org = {
  id: string; name: string; website: string | null; industry: string | null; description: string | null;
  languages: string[]; signature: string | null; summary: unknown; summary_status: string; summary_approved_at: string | null;
};

const LIST_FIELDS = [
  ["services", "Services"],
  ["certifications", "Certifications"],
  ["languages", "Languages supported"],
  ["differentiators", "Differentiators"],
] as const;

function Knowledge({ org, canEdit }: { org: Org; canEdit: boolean }) {
  const qc = useQueryClient();
  const { user } = useWorkspace();
  const gen = useServerFn(generateSummary);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<BrandSummary | null>((org.summary as BrandSummary) ?? null);
  useEffect(() => setS((org.summary as BrandSummary) ?? null), [org.summary]);

  async function generate() {
    setBusy(true);
    try {
      const res = await gen({ data: { organizationId: org.id } });
      setS(res);
      toast.success("Summary generated. Review and approve it.");
      qc.invalidateQueries({ queryKey: ["org", org.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(approve: boolean) {
    const { error } = await supabase.from("organizations").update({
      summary: s as never,
      summary_status: approve ? "approved" : "draft",
      summary_approved_at: approve ? new Date().toISOString() : null,
      summary_approved_by: approve ? user.id : null,
    }).eq("id", org.id);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "Approved — agents will use this summary" : "Draft saved");
    qc.invalidateQueries({ queryKey: ["org", org.id] });
    qc.invalidateQueries({ queryKey: ["orgs"] });
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">What the AI knows</h2>
          <p className="text-sm text-muted-foreground">Built only from your indexed documents. The approved version is given to every agent for this brand.</p>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={generate} disabled={busy}>
            <Sparkles className="size-4" /> {busy ? "Reading documents…" : s ? "Regenerate" : "Generate summary"}
          </Button>
        )}
      </div>
      {!s ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">No summary yet. Upload documents, then generate one.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5"><Label>Overview</Label>
            <Textarea rows={4} disabled={!canEdit} value={s.overview} onChange={(e) => setS({ ...s, overview: e.target.value })} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            {LIST_FIELDS.map(([k, label]) => (
              <div key={k} className="space-y-1.5"><Label>{label} <span className="text-xs text-muted-foreground">(one per line)</span></Label>
                <Textarea rows={5} disabled={!canEdit} value={s[k].join("\n")}
                  onChange={(e) => setS({ ...s, [k]: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></div>
            ))}
          </div>
          <div className="space-y-1.5"><Label>Pricing structure</Label>
            <Textarea rows={3} disabled={!canEdit} value={s.pricing} onChange={(e) => setS({ ...s, pricing: e.target.value })} /></div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => save(false)}>Save draft</Button>
              <Button variant="default" className="bg-success text-success-foreground hover:bg-success/90" onClick={() => save(true)}>
                <CheckCircle2 className="size-4" /> Approve
              </Button>
              {org.summary_approved_at && (
                <span className="text-xs text-muted-foreground">Last approved {new Date(org.summary_approved_at).toLocaleString()}</span>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Profile({ org, canEdit }: { org: Org; canEdit: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { current, user } = useWorkspace();
  const [f, setF] = useState({
    name: org.name, website: org.website ?? "", industry: org.industry ?? "", description: org.description ?? "",
    languages: org.languages.join(", "), signature: org.signature ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const { error } = await supabase.from("organizations").update({
      name: f.name, website: f.website || null, industry: f.industry || null, description: f.description || null,
      signature: f.signature || null, languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean),
    }).eq("id", org.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["org", org.id] });
  }
  async function del() {
    if (!confirm(`Delete ${org.name} and all its documents?`)) return;
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Organization deleted");
    navigate({ to: "/organizations" });
  }
  void current; void user;
  return (
    <Panel>
      <div className="grid max-w-3xl gap-4">
        <div className="space-y-1.5"><Label>Name</Label><Input disabled={!canEdit} value={f.name} onChange={set("name")} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Website</Label><Input disabled={!canEdit} value={f.website} onChange={set("website")} /></div>
          <div className="space-y-1.5"><Label>Industry</Label><Input disabled={!canEdit} value={f.industry} onChange={set("industry")} /></div>
        </div>
        <div className="space-y-1.5"><Label>Short description</Label><Textarea disabled={!canEdit} rows={3} value={f.description} onChange={set("description")} /></div>
        <div className="space-y-1.5"><Label>Default languages</Label><Input disabled={!canEdit} value={f.languages} onChange={set("languages")} /></div>
        <div className="space-y-1.5"><Label>Default sender signature</Label><Textarea disabled={!canEdit} rows={4} value={f.signature} onChange={set("signature")} /></div>
        {canEdit && (
          <div className="flex justify-between">
            <Button onClick={save}>Save</Button>
            <Button variant="ghost" className="text-destructive" onClick={del}><Trash2 className="size-4" /> Delete organization</Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Access({ orgId }: { orgId: string }) {
  const { current, user } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["org-access", orgId],
    queryFn: async () => {
      const { data: members } = await supabase.from("workspace_members").select("user_id,role").eq("workspace_id", current!.workspace_id).eq("active", true);
      const ids = (members ?? []).map((m) => m.user_id);
      const [{ data: profs }, { data: grants }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email").in("id", ids),
        supabase.from("organization_access").select("id,user_id").eq("organization_id", orgId),
      ]);
      return (members ?? []).filter((m) => m.role !== "super_admin").map((m) => ({
        ...m, profile: profs?.find((p) => p.id === m.user_id), grant: grants?.find((g) => g.user_id === m.user_id),
      }));
    },
  });
  async function toggle(userId: string, grantId?: string) {
    const { error } = grantId
      ? await supabase.from("organization_access").delete().eq("id", grantId)
      : await supabase.from("organization_access").insert({ organization_id: orgId, user_id: userId, granted_by: user.id });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["org-access", orgId] });
  }
  return (
    <Panel>
      <p className="mb-4 text-sm text-muted-foreground">Super Admins always have access. Grant Standard Users and Viewers access to this brand.</p>
      {!q.data?.length ? <p className="text-sm text-muted-foreground">No other team members yet. Invite people in Settings → Team.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Access</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {q.data.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell><div className="font-medium">{m.profile?.full_name}</div><div className="text-xs text-muted-foreground">{m.profile?.email}</div></TableCell>
                <TableCell>{m.grant ? <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs text-success">Granted</span> : <span className="text-xs text-muted-foreground">No access</span>}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => toggle(m.user_id, m.grant?.id)}>{m.grant ? "Revoke" : "Grant access"}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
