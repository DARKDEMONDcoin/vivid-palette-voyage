import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";

export function NotificationBell() {
  const { current, user } = useWorkspace();
  const ws = current?.workspace_id;
  const qc = useQueryClient();
  const q = useQuery({
    enabled: !!ws, queryKey: ["notifications", ws], refetchInterval: 60000,
    queryFn: async () => {
      const [n, drafts, prefs] = await Promise.all([
        supabase.from("notifications").select("id,title,link,read_at,created_at").eq("workspace_id", ws!).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", ws!).eq("status", "draft"),
        supabase.from("notification_prefs").select("approvals_waiting").eq("workspace_id", ws!).eq("user_id", user.id).maybeSingle(),
      ]);
      return { items: n.data ?? [], drafts: prefs.data?.approvals_waiting === false || current?.role === "viewer" ? 0 : drafts.count ?? 0 };
    },
  });
  const unread = (q.data?.items ?? []).filter((i) => !i.read_at).length + (q.data?.drafts ? 1 : 0);
  async function markRead() {
    if (!ws) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("workspace_id", ws).eq("user_id", user.id).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  return (
    <DropdownMenu onOpenChange={(o) => { if (!o && unread) void markRead(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warning" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!!q.data?.drafts && <DropdownMenuItem asChild><Link to="/campaigns">{q.data.drafts} messages waiting for approval</Link></DropdownMenuItem>}
        {q.data?.items.map((i) => (
          <DropdownMenuItem key={i.id} asChild>
            <a href={i.link ?? "#"} className={`flex flex-col items-start ${i.read_at ? "opacity-60" : ""}`}>
              <span className="text-sm">{i.title}</span>
              <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</span>
            </a>
          </DropdownMenuItem>))}
        {!q.data?.items.length && !q.data?.drafts && <p className="px-2 py-3 text-sm text-muted-foreground">You're all caught up.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
