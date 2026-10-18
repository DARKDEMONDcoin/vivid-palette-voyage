import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Linkedin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/external/client";
import { LINKEDIN_ACTIONS, LINKEDIN_ACTION_META, type LinkedInAction } from "@/lib/linkedin";
import { runLeadLinkedInAction } from "@/lib/linkedin.functions";

export function LeadLinkedInActions({ leadId, canAct }: { leadId: string; canAct: boolean }) {
  const qc = useQueryClient();
  const run = useServerFn(runLeadLinkedInAction);
  const [action, setAction] = useState<LinkedInAction | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const lead = useQuery({ queryKey: ["lead-linkedin", leadId], queryFn: async () => {
    const { data, error } = await supabase.from("leads").select("linkedin_url").eq("id", leadId).single();
    if (error) throw error; return data;
  } });
  const log = useQuery({ queryKey: ["linkedin-actions", leadId], queryFn: async () => {
    const { data, error } = await supabase.from("linkedin_actions").select("id,action,status,error,created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10);
    if (error) throw error; return data;
  } });
  const url = lead.data?.linkedin_url;

  async function go(a: LinkedInAction) {
    const meta = LINKEDIN_ACTION_META[a];
    if (meta.textLabel && action !== a) { setAction(a); setText(""); return; }
    setBusy(true);
    try {
      await run({ data: { leadId, action: a, text } });
      toast.success(`${meta.label} started on LinkedIn`);
      setAction(null); setText("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "LinkedIn action failed"); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["linkedin-actions", leadId] }); }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><Linkedin className="size-4 text-channel-linkedin" /> LinkedIn actions</div>
      {!url && !lead.isPending && <p className="text-sm text-muted-foreground">This lead has no LinkedIn profile link, so only "Share content" can run.</p>}
      <div className="flex flex-wrap gap-2">
        {LINKEDIN_ACTIONS.map((a) => (
          <Button key={a} size="sm" variant={action === a ? "default" : "outline"} disabled={!canAct || busy || (!url && a !== "share")} onClick={() => go(a)}>
            {LINKEDIN_ACTION_META[a].label}
          </Button>
        ))}
      </div>
      {action && LINKEDIN_ACTION_META[action].textLabel && (
        <div className="space-y-2">
          <Textarea rows={3} maxLength={action === "connect" ? 300 : 3000} placeholder={LINKEDIN_ACTION_META[action].textLabel} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || (LINKEDIN_ACTION_META[action].needsText && !text.trim())} onClick={() => go(action)}>
              {busy && <Loader2 className="size-4 animate-spin" />}Run {LINKEDIN_ACTION_META[action].label.toLowerCase()}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {!canAct && <p className="text-xs text-muted-foreground">Viewers can't run LinkedIn actions.</p>}
      {!!log.data?.length && (
        <ul className="space-y-1 text-xs">
          {log.data.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              <span>{LINKEDIN_ACTION_META[r.action as LinkedInAction]?.label ?? r.action}</span>
              <span className={r.status === "failed" ? "text-destructive" : r.status === "launched" ? "text-success" : "text-muted-foreground"}>{r.status}</span>
              {r.error && <span className="text-muted-foreground">— {r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
