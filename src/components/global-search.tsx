import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Megaphone, Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";

type Hit = { kind: "lead" | "campaign" | "agent"; id: string; label: string; sub: string };

// Header search across leads, campaigns and agents in the current workspace.
export function GlobalSearch() {
  const { current } = useWorkspace();
  const ws = current?.workspace_id;
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setTerm(text.trim().replace(/[%,()]/g, "")), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);

  const q = useQuery({
    queryKey: ["global-search", ws, term], enabled: !!ws && term.length >= 2,
    queryFn: async (): Promise<Hit[]> => {
      const like = `%${term}%`;
      const [l, c, a] = await Promise.all([
        supabase.from("leads").select("id,first_name,last_name,email,company").eq("workspace_id", ws!)
          .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`).limit(5),
        supabase.from("campaigns").select("id,name,status").eq("workspace_id", ws!).ilike("name", like).limit(5),
        supabase.from("agents").select("id,name").eq("workspace_id", ws!).ilike("name", like).limit(5),
      ]);
      return [
        ...(l.data ?? []).map((x) => ({ kind: "lead" as const, id: x.id, label: [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email || "Lead", sub: [x.company, x.email].filter(Boolean).join(" · ") })),
        ...(c.data ?? []).map((x) => ({ kind: "campaign" as const, id: x.id, label: x.name, sub: `Campaign · ${x.status}` })),
        ...(a.data ?? []).map((x) => ({ kind: "agent" as const, id: x.id, label: x.name, sub: "Agent" })),
      ];
    },
  });

  function go(h: Hit) {
    setOpen(false); setText("");
    if (h.kind === "lead") navigate({ to: "/leads", search: { q: h.sub.split(" · ").pop() || h.label } });
    else if (h.kind === "campaign") navigate({ to: "/campaigns/$campaignId", params: { campaignId: h.id } });
    else navigate({ to: "/agents/$agentId", params: { agentId: h.id } });
  }
  const hits = term.length >= 2 ? q.data ?? [] : [];
  const Icon = { lead: Users, campaign: Megaphone, agent: Bot };

  return (
    <div ref={box} className="relative ml-2 hidden max-w-md flex-1 md:block">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input placeholder="Search leads, campaigns, agents…" className="rounded-full bg-secondary pl-9" value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") { if (hits[0]) go(hits[0]); else if (term) { setOpen(false); navigate({ to: "/leads", search: { q: term } }); } }
        }} />
      {open && term.length >= 2 && (
        <div role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-11 z-20 max-h-96 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          {q.isLoading ? <p className="p-3 text-sm text-muted-foreground">Searching…</p> : !hits.length ? <p className="p-3 text-sm text-muted-foreground">No matches.</p> :
            hits.map((h) => { const I = Icon[h.kind]; return (
              <button key={h.kind + h.id} role="option" aria-selected={false} onClick={() => go(h)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent">
                <I className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{h.label}</span><span className="block truncate text-xs text-muted-foreground">{h.sub}</span></span>
              </button>); })}
        </div>)}
    </div>
  );
}
