# VEXO AI

A separate GitHub Pages frontend for VEXO AI, using `huihui_ai/gemma-4-abliterated:latest` through an Ollama-compatible server and a Supabase Edge Function.

## Architecture

GitHub Pages -> VEXO AI frontend -> Supabase Edge Function -> Ollama -> `huihui_ai/gemma-4-abliterated:latest`

The Ollama server URL and optional API key stay in Supabase Edge Function secrets instead of the browser.

## 1. Deploy the frontend

Put `index.html` in a GitHub repo named `Vexo-AI` and enable GitHub Pages.

Example URL:

`https://vexo-sirramenboi.github.io/Vexo-AI/`

## 2. Deploy the Supabase Edge Function

Create the function from `supabase/functions/vexo-ai/index.ts` in your Supabase project.

Set these secrets in Supabase Edge Functions:

- `OLLAMA_BASE_URL` — the URL of an Ollama server that you are authorized to use, without `/api/chat`.
- `OLLAMA_API_KEY` — optional, only if that Ollama endpoint requires one.

Example CLI commands:

```bash
supabase secrets set OLLAMA_BASE_URL=https://YOUR-OLLAMA-HOST
supabase secrets set OLLAMA_API_KEY=YOUR_KEY_IF_NEEDED
```

Then deploy:

```bash
supabase functions deploy vexo-ai --no-verify-jwt
```

The function URL will be:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/vexo-ai`

## 3. Update the frontend URL

In `index.html`, change:

```js
const API_URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/vexo-ai";
```

to your real function URL.

The model name is already set to:

```text
huihui_ai/gemma-4-abliterated:latest
```

## 4. Embed in VEXO Community

Add a sidebar button and page containing:

```html
<iframe
  src="https://vexo-sirramenboi.github.io/Vexo-AI/"
  title="VEXO AI"
  style="width:100%;height:calc(100vh - 125px);min-height:650px;border:0;background:#06090f;"
></iframe>
```

## Notes

- The browser never receives the Ollama server URL from the Edge Function secret or its API key.
- The frontend keeps the last 30 messages in localStorage.
- The Edge Function adds a safety-focused system prompt and a small output profanity pass for the public site.
- A reachable Ollama-compatible HTTP endpoint is required; GitHub Pages itself cannot run Ollama.
