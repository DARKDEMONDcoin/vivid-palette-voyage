// Server-only LLM helper. Routes to the built-in AI gateway or the workspace's own provider key.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type LlmKind = "research" | "scoring";
type LlmConfig = { provider: string; model: string; key: string | null };

const DEFAULTS = { research: "openai/gpt-6-astra", scoring: "openai/gpt-6-luna" };

export async function getLlmConfig(workspaceId: string, kind: LlmKind): Promise<LlmConfig> {
  const { supabaseAdmin } = await import("@/integrations/external/client.server");
  const { data: row } = await supabaseAdmin.from("integrations").select("id,status,config").eq("workspace_id", workspaceId).eq("provider", "llm").maybeSingle();
  const cfg = (row?.status === "connected" ? row.config : {}) as Record<string, string>;
  const provider = cfg["provider"] || "lovable";
  const model = (kind === "research" ? cfg["research_model"] : cfg["scoring_model"]) || DEFAULTS[kind];
  if (provider === "lovable") return { provider, model: model.includes("/") ? model : DEFAULTS[kind], key: null };
  const { data: s } = await supabaseAdmin.from("integration_secrets").select("secret").eq("integration_id", row!.id).maybeSingle();
  if (!s?.secret) throw new Error("Your AI provider key is missing — reconnect it on the Integrations page.");
  return { provider, model, key: s.secret };
}

async function* sse(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try { yield JSON.parse(p) as Record<string, unknown>; } catch { /* partial */ }
    }
  }
}

function friendly(status: number, body: string): Error {
  let msg = body.slice(0, 300);
  try { const j = JSON.parse(body) as { message?: string; error?: { message?: string } | string }; msg = j.message ?? (typeof j.error === "string" ? j.error : j.error?.message) ?? msg; } catch { /* text */ }
  if (status === 402) return new Error(msg || "AI credits exhausted.");
  return new Error(`AI request failed [${status}]: ${msg}`);
}

function parseJson<T>(text: string): T {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AI returned no structured answer");
  return JSON.parse(text.slice(s, e + 1)) as T;
}

/** Streams a JSON-schema constrained completion and returns the parsed object. */
export async function llmJson<T>(cfg: LlmConfig, instructions: string, input: string, name: string, schema: object): Promise<T> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const builtin = cfg.provider === "lovable";
  if (builtin && !lovableKey) throw new Error("AI is not configured.");
  const gwHeaders = { Authorization: `Bearer ${lovableKey}`, "Lovable-API-Key": lovableKey ?? "", "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" };
  const family = builtin ? cfg.model.split("/")[0] : cfg.provider === "gemini" ? "google" : cfg.provider;
  const jsonHint = `\n\nReply with ONLY a JSON object matching this schema:\n${JSON.stringify(schema)}`;
  let res: Response;
  let out = "";

  if (family === "openai") {
    const body: Record<string, unknown> = {
      model: cfg.model, stream: true, store: false, instructions, input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    };
    if (cfg.model !== "openai/chat-latest") body["reasoning"] = { effort: "low" };
    res = await fetch(builtin ? `${GATEWAY}/responses` : "https://api.openai.com/v1/responses", {
      method: "POST", headers: builtin ? gwHeaders : { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw friendly(res.status, await res.text());
    for await (const ev of sse(res)) {
      if (ev["type"] === "response.output_text.delta") out += String(ev["delta"] ?? "");
      if (ev["type"] === "response.failed" || ev["type"] === "error") throw new Error("AI request failed");
    }
  } else if (family === "anthropic") {
    const body = { model: cfg.model, stream: true, max_tokens: 4096, system: instructions + jsonHint, messages: [{ role: "user", content: input }] };
    res = await fetch(builtin ? `${GATEWAY}/messages` : "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: builtin ? { ...gwHeaders, "anthropic-version": "2023-06-01" } : { "x-api-key": cfg.key ?? "", "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw friendly(res.status, await res.text());
    for await (const ev of sse(res)) {
      const d = ev["delta"] as { type?: string; text?: string } | undefined;
      if (ev["type"] === "content_block_delta" && d?.type === "text_delta") out += d.text ?? "";
      if (ev["type"] === "error") throw new Error("AI request failed");
    }
  } else {
    const body = {
      model: cfg.model, stream: true,
      messages: [{ role: "system", content: instructions }, { role: "user", content: input }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    };
    res = await fetch(builtin ? `${GATEWAY}/chat/completions` : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST", headers: builtin ? gwHeaders : { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw friendly(res.status, await res.text());
    for await (const ev of sse(res)) {
      const ch = (ev["choices"] as { delta?: { content?: string } }[] | undefined)?.[0];
      if (ch?.delta?.content) out += ch.delta.content;
    }
  }
  if (!out.trim()) throw new Error("The AI returned an empty answer.");
  return parseJson<T>(out);
}

/** Fetches a page and returns cleaned text plus language/location signals. */
export async function fetchPage(url: string): Promise<{ url: string; text: string; hreflangs: string[]; links: string[] } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OutreachAI/1.0)", Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 600_000);
    const hreflangs = [...new Set([...html.matchAll(/hreflang=["']([a-zA-Z-]+)["']/g)].map((m) => m[1]!.toLowerCase()))];
    const links = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => { try { return new URL(m[1]!, res.url).toString(); } catch { return ""; } }).filter(Boolean))];
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 12_000);
    return { url: res.url, text, hreflangs, links };
  } catch {
    return null;
  }
}

export function siteUrl(website: string | null, domain: string | null): string | null {
  const raw = (website || domain || "").trim();
  if (!raw) return null;
  try { return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).origin; } catch { return null; }
}
