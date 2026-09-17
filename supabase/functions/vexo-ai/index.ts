const MODEL = "huihui_ai/gemma-4-abliterated:latest";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;
const rateBuckets = new Map<string, { start: number; count: number }>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are VEXO AI, an assistant used on a public community website.
Be helpful, clear, and concise. Help with coding, debugging, explanations, writing, math, and general questions.
Do not provide graphic sexual content, sexual content involving minors, instructions for self-harm, instructions for dangerous weapons or drugs, or instructions for bypassing safety, age, authentication, or access controls.
Do not claim to have performed actions you did not perform. When uncertain, say so.
Prefer practical, safe alternatives when a request is unsafe.`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function scrubOutput(text: string): string {
  // Small server-side profanity pass so the public frontend does not rely only on browser filtering.
  const patterns = [
    /\bf+u+c+k+\b/gi,
    /\bs+h+i+t+\b/gi,
    /\bb+i+t+c+h+\b/gi,
    /\ba+s+s+h+o+l+e\b/gi,
  ];
  let out = text;
  for (const pattern of patterns) out = out.replace(pattern, m => "*".repeat(Math.max(3, m.length)));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX) {
      return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
    }
  }

  const ollamaBase = (Deno.env.get("OLLAMA_BASE_URL") || "").replace(/\/+$/, "");
  const ollamaKey = Deno.env.get("OLLAMA_API_KEY") || "";
  if (!ollamaBase) {
    return json({ error: "OLLAMA_BASE_URL is not configured on this Edge Function." }, 500);
  }

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body." }, 400); }

  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const safeMessages = incoming
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 12000) }));

  if (!safeMessages.length || !safeMessages.some((m: any) => m.role === "user")) {
    return json({ error: "Send at least one user message." }, 400);
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...safeMessages];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const headers: Record<string,string> = { "Content-Type": "application/json" };
    if (ollamaKey) headers.Authorization = `Bearer ${ollamaKey}`;

    const upstream = await fetch(`${ollamaBase}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        keep_alive: "10m",
      }),
      signal: controller.signal,
    });

    const raw = await upstream.text();
    let data: any = {};
    try { data = JSON.parse(raw); } catch { data = {}; }

    if (!upstream.ok) {
      return json({ error: data?.error || raw || `Ollama returned ${upstream.status}.` }, 502);
    }

    const content = data?.message?.content ?? data?.response;
    if (typeof content !== "string") return json({ error: "Ollama returned no assistant content." }, 502);

    return json({
      model: MODEL,
      message: { role: "assistant", content: scrubOutput(content) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message.includes("aborted") ? "Ollama request timed out." : `Could not reach Ollama: ${message}` }, 502);
  } finally {
    clearTimeout(timer);
  }
});
