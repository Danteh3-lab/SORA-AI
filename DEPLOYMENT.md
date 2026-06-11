# Deploy AURA

## Railway backend

1. Create a Railway project from this GitHub repository.
2. Generate a public domain for the service.
3. Add a volume mounted at `/data` so assistant memory survives deployments.
4. Add these service variables:

```text
NVIDIA_API_KEY=your-key
SORA_LLM_PROVIDER=nvidia_nim
SORA_STT_PROVIDER=nvidia_nim
SORA_TTS_PROVIDER=browser
SORA_LLM_MODEL=meta/llama-3.3-70b-instruct
SORA_STT_MODEL=nvidia/nemotron-asr-streaming
SORA_TTS_MODEL=browser-speech
SORA_TTS_VOICE=default
SORA_ALLOWED_ORIGINS=https://your-site.netlify.app
SORA_ALLOW_SETTINGS_WRITE=false
```

Railway supplies `PORT` automatically. When a volume is attached, AURA automatically
uses `RAILWAY_VOLUME_MOUNT_PATH` for its SQLite memory database.

## Netlify frontend

Keep the existing Netlify build settings and add this environment variable:

```text
VITE_API_BASE_URL=https://your-service.up.railway.app
```

Redeploy Netlify after adding the variable. Also update `SORA_ALLOWED_ORIGINS` on
Railway if the Netlify domain changes.

## Production security

Settings writes are disabled automatically on Railway unless
`SORA_ALLOW_SETTINGS_WRITE=true` is explicitly configured. Keep provider API keys in
Railway variables, never in Git or Netlify's frontend environment variables.
