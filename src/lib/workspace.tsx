import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/external/client";

export type AppRole = "super_admin" | "standard" | "viewer";
export type Membership = {
  workspace_id: string;
  role: AppRole;
  workspace: { id: string; name: string; is_demo: boolean };
};

type Ctx = {
  user: User;
  memberships: Membership[];
  current: Membership | null;
  setCurrentId: (id: string) => void;
  isAdmin: boolean;
  refetch: () => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ user, children }: { user: User; children: ReactNode }) {
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  useEffect(() => {
    setCurrentIdState(localStorage.getItem("ws:current"));
  }, []);

  const q = useQuery({
    queryKey: ["memberships", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspace:workspaces(id,name,is_demo)")
        .eq("user_id", user.id)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });

  const memberships = q.data ?? [];
  const current = memberships.find((m) => m.workspace_id === currentId) ?? memberships[0] ?? null;

  const setCurrentId = (id: string) => {
    localStorage.setItem("ws:current", id);
    setCurrentIdState(id);
  };

  // Pages assume a current workspace exists, so wait for memberships before rendering them.
  if (q.isLoading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading your workspace…</div>;
  if (q.isError) return <div className="flex min-h-screen items-center justify-center text-sm text-destructive">Couldn't load your workspace. Please refresh.</div>;
  if (!current) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">Your account isn't an active member of any workspace. Ask a Super Admin to invite or reactivate you.</div>;

  return (
    <WorkspaceCtx.Provider
      value={{ user, memberships, current, setCurrentId, isAdmin: current?.role === "super_admin", refetch: q.refetch }}
    >
      {children}
    </WorkspaceCtx.Provider>
  );
}

export function useWorkspace() {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error("useWorkspace outside provider");
  return c;
}

export const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  standard: "Standard User",
  viewer: "Viewer",
};
