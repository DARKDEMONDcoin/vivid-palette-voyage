import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_MODEL = "google/gemini-embedding-2";
const CHAT_MODEL = "openai/gpt-6-astra";

function chunkText(text: string, size = 1800, overlap = 200): string[] {
  const clean = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const brk = clean.lastIndexOf("\n", end);
      const sp = clean.lastIndexOf(" ", end);
      const cut = brk > start + size / 2 ? brk : sp > start + size / 2 ? sp : end;
      end = cut;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

async function embed(apiKey: string, input: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${GATEWAY}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      const out: number[][] = new Array(input.length);
      for (const d of json.data) out[d.index] = d.embedding;
      if (out.some((v) => !v)) throw new Error("Missing embedding in response");
      return out;
    }
    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.text();
    if (!retryable || attempt >= 4) {
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue indexing.");
      throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const ra = Number(res.headers.get("Retry-After"));
    await new Promise((r) => setTimeout(r, (ra > 0 ? ra * 1000 : 1000 * 2 ** attempt) + Math.random() * 500));
  }
}

export const indexDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; text: string }) => {
    if (!d?.documentId || typeof d.text !== "string") throw new Error("Invalid input");
    return { documentId: d.documentId, text: d.text.slice(0, 2_000_000) };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase.from("documents").select("id, organization_id, doc_type").eq("id", data.documentId).single();
    if (error || !doc) throw new Error("Document not found");

    const fail = async (msg: string) => {
      await supabase.from("documents").update({ status: "failed", error: msg }).eq("id", doc.id);
      return { ok: false as const, error: msg };
    };

    await supabase.from("documents").update({ status: "parsing", error: null }).eq("id", doc.id);
    const chunks = chunkText(data.text);
    if (chunks.length === 0) return fail("No readable text found in this file.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return fail("AI is not configured.");

    try {
      await supabase.from("document_chunks").delete().eq("document_id", doc.id);
      const BATCH = 16;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const vectors = await embed(apiKey, batch);
        const rows = batch.map((content, j) => ({
          document_id: doc.id,
          organization_id: doc.organization_id,
          doc_type: doc.doc_type,
          chunk_index: i + j,
          content,
          embedding: JSON.stringify(vectors[j]),
        }));
        const { error: insErr } = await supabase.from("document_chunks").insert(rows);
        if (insErr) throw new Error(insErr.message);
      }
      await supabase
        .from("documents")
        .update({ status: "indexed", chunk_count: chunks.length, indexed_at: new Date().toISOString(), error: null })
        .eq("id", doc.id);
      return { ok: true as const, chunks: chunks.length };
    } catch (e) {
      return fail((e as Error).message);
    }
  });

const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "services", "certifications", "languages", "pricing", "differentiators"],
  properties: {
    overview: { type: "string" },
    services: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
    pricing: { type: "string" },
    differentiators: { type: "array", items: { type: "string" } },
  },
};

export type BrandSummary = {
  overview: string;
  services: string[];
  certifications: string[];
  languages: string[];
  pricing: string;
  differentiators: string[];
};

export const generateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => {
    if (!d?.organizationId) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: org } = await supabase.from("organizations").select("id,name,website,industry,description").eq("id", data.organizationId).single();
    if (!org) throw new Error("Organization not found");
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("doc_type, content, chunk_index")
      .eq("organization_id", org.id)
      .order("chunk_index")
      .limit(120);
    if (!chunks?.length) throw new Error("Upload and index at least one document first.");

    let budget = 60_000;
    const context_text = chunks
      .filter((c) => (budget -= c.content.length) > 0)
      .map((c) => `[${c.doc_type}] ${c.content}`)
      .join("\n---\n");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const res = await fetch(`${GATEWAY}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "You summarize a company's brand knowledge base for sales agents. Use ONLY facts stated in the provided documents. Never invent certifications, prices, clients, languages or statistics. If something is not stated, return an empty list or the string 'Not stated in documents'.",
        input: `Company: ${org.name}\nWebsite: ${org.website ?? "-"}\nIndustry: ${org.industry ?? "-"}\nDescription: ${org.description ?? "-"}\n\nDocuments:\n${context_text}`,
        text: { format: { type: "json_schema", name: "brand_summary", strict: true, schema: summarySchema } },
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text();
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`Summary failed (${res.status}): ${t.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload) as { type?: string; delta?: string; response?: { error?: { message?: string } } };
            if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
            if (ev.type === "response.failed") throw new Error(ev.response?.error?.message ?? "AI request failed");
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
    const summary = JSON.parse(out) as BrandSummary;
    const { error } = await supabase
      .from("organizations")
      .update({ summary, summary_status: "draft", summary_approved_at: null, summary_approved_by: null })
      .eq("id", org.id);
    if (error) throw new Error(error.message);
    return summary;
  });
