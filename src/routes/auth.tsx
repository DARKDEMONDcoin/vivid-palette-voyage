import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/external/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeAuthDestination } from "@/lib/mailbox-rules";

type Search = { redirect?: string | undefined };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s["redirect"] === "string" ? (s["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Outreach AI" },
      { name: "description", content: "Sign in to your AI SDR workspace." },
      { property: "og:title", content: "Sign in — Outreach AI" },
      { property: "og:description", content: "Sign in to your AI SDR workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  return safeAuthDestination(p, window.location.origin);
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const finish = () => {
      const destination = safePath(redirect ?? sessionStorage.getItem("auth:destination") ?? undefined);
      sessionStorage.removeItem("auth:destination");
      navigate({ to: destination as "/dashboard" });
    };
    supabase.auth.getUser().then(({ data }) => { if (data.user) finish(); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) finish();
    });
    return () => listener.subscription.unsubscribe();
  }, [redirect, navigate]);

  async function social(provider: "google" | "microsoft") {
    setBusy(true);
    try {
      sessionStorage.setItem("auth:destination", safePath(redirect));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === "microsoft" ? "azure" : "google",
        options: provider === "microsoft" ? { redirectTo: window.location.origin + "/auth", scopes: "email" } : { redirectTo: window.location.origin + "/auth" },
      });
      if (error) throw error;
    } catch (err) {
      toast.error((err as Error).message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safePath(redirect) as "/dashboard" });
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/auth", data: { full_name: name } },
        });
        if (error) throw error;
        setSent("Check your inbox to confirm your email, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setSent("If an account exists, a reset link is on its way.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-gradient p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 font-display text-xl font-semibold">
          <Sparkles className="size-5" /> Outreach AI
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">AI SDRs that research, qualify and reach out — for every brand you run.</h1>
          <p className="mt-4 max-w-md opacity-80">Email, LinkedIn and AI calls, grounded in your own documents.</p>
        </div>
        <p className="text-sm opacity-60">© {new Date().getFullYear()} Outreach AI</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">
            {mode === "in" ? "Welcome back" : mode === "up" ? "Create your account" : "Reset password"}
          </h2>
          {sent ? (
            <div className="mt-6 rounded-xl bg-sky p-4 text-sm">{sent}
              <Button variant="link" className="px-0" onClick={() => { setSent(null); setMode("in"); }}>Back to sign in</Button>
            </div>
          ) : (
            <>
            {mode !== "forgot" && (
              <div className="mt-6 space-y-2">
                <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => social("google")}>Continue with Google</Button>
                <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => social("microsoft")}>Continue with Microsoft</Button>
                <p className="pt-2 text-center text-xs text-muted-foreground">or with email</p>
              </div>
            )}
            <form onSubmit={submit} className="mt-4 space-y-4">
              {mode === "up" && (
                <div className="space-y-2"><Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              )}
              <div className="space-y-2"><Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              {mode !== "forgot" && (
                <div className="space-y-2"><Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
              </Button>
              <div className="flex justify-between text-sm">
                {mode === "in" ? (
                  <>
                    <button type="button" className="text-primary hover:underline" onClick={() => setMode("up")}>Create account</button>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>Forgot password?</button>
                  </>
                ) : (
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode("in")}>Back to sign in</button>
                )}
              </div>
            </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
