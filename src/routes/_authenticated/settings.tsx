import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { ApiWebhooks, AuditLog, Compliance, Notifications, Usage } from "@/components/settings-modules";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/external/client";
import { roleLabel, useWorkspace, type AppRole } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Outreach AI" }, { name: "description", content: "Profile, workspace and team settings." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin } = useWorkspace();
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="compliance">Compliance & suppression</TabsTrigger>
          <TabsTrigger value="usage">Usage & billing</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit">Audit log</TabsTrigger>}
          {isAdmin && <TabsTrigger value="api">API & webhooks</TabsTrigger>}
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="workspace"><WorkspaceTab /></TabsContent>
        {isAdmin && <TabsContent value="team"><Team /></TabsContent>}
        <TabsContent value="compliance"><Compliance /></TabsContent>
        <TabsContent value="usage"><Usage /></TabsContent>
        {isAdmin && <TabsContent value="audit"><AuditLog /></TabsContent>}
        {isAdmin && <TabsContent value="api"><ApiWebhooks /></TabsContent>}
        <TabsContent value="notifications"><Notifications /></TabsContent>
      </Tabs>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 max-w-3xl rounded-2xl bg-card p-6 shadow-soft">{children}</div>;
}

function Profile() {
  const { user } = useWorkspace();
  const [name, setName] = useState((user.user_metadata?.["full_name"] as string) ?? "");
  async function save() {
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { full_name: name } });
    error ? toast.error(error.message) : toast.success("Profile saved");
  }
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-2"><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
      </div>
      <Button className="mt-4" onClick={save}>Save</Button>
    </Card>
  );
}

function WorkspaceTab() {
  const { current, isAdmin, refetch } = useWorkspace();
  const [name, setName] = useState(current?.workspace.name ?? "");
  if (!current) return null;
  async function save() {
    const { error } = await supabase.from("workspaces").update({ name }).eq("id", current!.workspace_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Workspace updated");
    refetch();
  }
  return (
    <Card>
      <div className="space-y-2"><Label>Workspace name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} /></div>
      {isAdmin && <Button className="mt-4" onClick={save}>Save</Button>}
    </Card>
  );
}

function Team() {
  const { current, user } = useWorkspace();
  const ws = current!.workspace_id;
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("standard");

  const members = useQuery({
    queryKey: ["members", ws],
    queryFn: async () => {
      const { data: m, error } = await supabase.from("workspace_members").select("id,user_id,role,active").eq("workspace_id", ws);
      if (error) throw error;
      const { data: p } = await supabase.from("profiles").select("id,full_name,email").in("id", m.map((x) => x.user_id));
      return m.map((x) => ({ ...x, profile: p?.find((y) => y.id === x.user_id) }));
    },
  });
  const invites = useQuery({
    queryKey: ["invites", ws],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspace_invitations").select("*").eq("workspace_id", ws).is("accepted_at", null);
      if (error) throw error;
      return data;
    },
  });

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("workspace_invitations").insert({ workspace_id: ws, email: email.trim().toLowerCase(), role, invited_by: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success(`Invitation saved for ${email}`);
    setEmail("");
    qc.invalidateQueries({ queryKey: ["invites", ws] });
  }
  async function updateMember(id: string, patch: { role?: AppRole; active?: boolean }) {
    const { error } = await supabase.from("workspace_members").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["members", ws] });
  }
  async function revoke(id: string) {
    await supabase.from("workspace_invitations").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["invites", ws] });
  }

  return (
    <Card>
      <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-2 min-w-56"><Label>Invite by email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
        <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(roleLabel) as AppRole[]).map((r) => <SelectItem key={r} value={r}>{roleLabel[r]}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="submit">Invite</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Invited people join this workspace automatically when they sign up with that email.</p>

      <Table className="mt-6">
        <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {members.data?.map((m) => (
            <TableRow key={m.id}>
              <TableCell><div className="font-medium">{m.profile?.full_name}</div><div className="text-xs text-muted-foreground">{m.profile?.email}</div></TableCell>
              <TableCell>
                <Select value={m.role} disabled={m.user_id === user.id} onValueChange={(v) => updateMember(m.id, { role: v as AppRole })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(roleLabel) as AppRole[]).map((r) => <SelectItem key={r} value={r}>{roleLabel[r]}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell><span className={`rounded-full px-2.5 py-0.5 text-xs ${m.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{m.active ? "Active" : "Deactivated"}</span></TableCell>
              <TableCell className="text-right">
                {m.user_id !== user.id && <Button variant="ghost" size="sm" onClick={() => updateMember(m.id, { active: !m.active })}>{m.active ? "Deactivate" : "Reactivate"}</Button>}
              </TableCell>
            </TableRow>
          ))}
          {invites.data?.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="text-muted-foreground">{i.email}</TableCell>
              <TableCell>{roleLabel[i.role]}</TableCell>
              <TableCell><span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs text-warning">Pending</span></TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => revoke(i.id)}>Revoke</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
