import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startMailboxConnect, completeMailboxConnect, getMailboxStatus, disconnectAgentMailbox } from "@/lib/mailbox.functions";

export function AgentMailbox({ agentId, workspaceId }: { agentId?: string | undefined; workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const start = useServerFn(startMailboxConnect), complete = useServerFn(completeMailboxConnect), status = useServerFn(getMailboxStatus), unlink = useServerFn(disconnectAgentMailbox);
  const q = useQuery({ queryKey: ["mailbox", agentId, workspaceId], enabled: !!agentId, queryFn: () => {
    if (!agentId) throw new Error("Save the agent first");
    return status({ data: { agentId, workspaceId } });
  } });
  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["mailbox", agentId, workspaceId] }), qc.invalidateQueries({ queryKey: ["agent", agentId] }), qc.invalidateQueries({ queryKey: ["agents"] })]);
  }
  async function connect(provider: "gmail" | "outlook") {
    if (!agentId) return;
    const popup = window.open("", "agent-mailbox-consent", "width=600,height=720");
    if (!popup) { toast.error("Allow popups to connect your mailbox"); return; }
    setBusy(true);
    try {
      const result = await start({ data: { agentId, workspaceId, provider } });
      const code = await new Promise<string>((resolve, reject) => {
        // Google/Microsoft sign-in pages can cut the link back to this window, so the
        // return page also reports through same-origin channels (BroadcastChannel / storage).
        const storageKey = `agent-mailbox-consent:${result.attemptId}`;
        const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("agent-mailbox-consent") : null;
        let closedAt: number | null = null;
        const cleanup = () => { window.removeEventListener("message", receive); window.removeEventListener("storage", onStorage); channel?.close(); window.clearInterval(poll); window.clearTimeout(timeout); try { localStorage.removeItem(storageKey); } catch { /* ignore */ } };
        const handle = (data: { type?: unknown; attemptId?: unknown; connectorId?: unknown; success?: unknown; code?: unknown; offlineDisabled?: unknown } | null | undefined) => {
          if (data?.type !== "agentMailboxComplete" || data.attemptId !== result.attemptId || data.connectorId !== result.connectorId) return;
          cleanup();
          if (data.success && typeof data.code === "string" && data.code) resolve(data.code);
          else reject(new Error(data.offlineDisabled ? "A workspace admin must enable offline access for this mailbox provider" : "Mailbox consent was not completed"));
        };
        const receive = (event: MessageEvent) => { if (event.origin === window.location.origin && event.source === popup) handle(event.data); };
        const readStored = () => { try { const v = localStorage.getItem(storageKey); if (v) handle(JSON.parse(v)); } catch { /* ignore */ } };
        const onStorage = (event: StorageEvent) => { if (event.key === storageKey) readStored(); };
        if (channel) channel.onmessage = (event) => handle(event.data);
        // Give the return page a moment to report before treating a closed window as cancelled.
        const poll = window.setInterval(() => {
          if (!popup.closed) { closedAt = null; return; }
          readStored();
          closedAt ??= Date.now();
          if (Date.now() - closedAt > 2500) { cleanup(); reject(new Error("Mailbox connection cancelled")); }
        }, 500);
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Mailbox connection expired; try again")); }, 600000);
        window.addEventListener("message", receive);
        window.addEventListener("storage", onStorage);
        popup.location.href = result.authorizationUrl;
      });
      const saved = await complete({ data: { agentId, workspaceId, attemptId: result.attemptId, code } });
      await refresh();
      toast.success(`${q.data?.connected ? "Reconnected" : "Connected"}: ${saved.email}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mailbox connection failed"); }
    finally { popup.close(); setBusy(false); }
  }
  async function disconnect() {
    if (!agentId || !confirm("Unlink this mailbox from this agent?")) return;
    setBusy(true);
    try { await unlink({ data: { agentId, workspaceId } }); await refresh(); toast.success("Mailbox unlinked from agent"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not unlink mailbox"); }
    finally { setBusy(false); }
  }
  if (!agentId) return <p className="text-sm text-muted-foreground">Save the agent before connecting a mailbox.</p>;
  return <div className="space-y-3">
    <div className="flex items-start gap-3 text-sm"><Mail className="mt-0.5 size-4 shrink-0 text-primary" /><div>
      <p className="font-medium">{q.isPending ? "Checking mailbox…" : q.data?.reconnectRequired ? "Mailbox access needs to be renewed" : q.data?.connected ? q.data.email : "Not connected"}</p>
      {q.isError && <p className="text-destructive">{q.error.message}</p>}
    </div></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy || q.isPending || q.isError || !q.data?.googleReady} onClick={() => connect("gmail")}>
        {busy && <Loader2 className="size-4 animate-spin" />}{q.data?.provider === "gmail" && (q.data.connected || q.data.reconnectRequired) ? "Reconnect Gmail" : "Connect Gmail"}
      </Button>
      <Button type="button" variant="outline" disabled={busy || q.isPending || q.isError || !q.data?.microsoftReady} onClick={() => connect("outlook")}>
        {q.data?.provider === "outlook" && (q.data.connected || q.data.reconnectRequired) ? "Reconnect Outlook" : "Connect Outlook"}
      </Button>
      {(q.data?.connected || q.data?.reconnectRequired) && <Button type="button" variant="ghost" disabled={busy} onClick={disconnect}><Unlink className="size-4" /> Unlink</Button>}
    </div>
    {q.data && (!q.data.googleReady || !q.data.microsoftReady) && <p className="text-sm text-muted-foreground">{!q.data.googleReady ? "Google" : ""}{!q.data.googleReady && !q.data.microsoftReady ? " and " : ""}{!q.data.microsoftReady ? "Microsoft" : ""} mailbox setup is pending workspace administrator approval.</p>}
  </div>;
}
