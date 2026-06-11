export type AssistantBackendState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';
export type AIMode = 'idle' | 'listening' | 'thinking' | 'responding';

export interface AssistantTurn {
  session_id: string;
  user_text: string;
  assistant_text: string;
  state_history: AssistantBackendState[];
  audio?: {
    audio_base64?: string;
    mime_type?: string;
    provider?: string;
    model?: string | null;
  } | null;
  saved_memory?: {
    id: string;
    text: string;
    tags: string[];
    created_at: string;
    updated_at: string;
  } | null;
}

export interface AssistantEvent {
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

export const ASSISTANT_API_BASE =
  (import.meta.env.VITE_ASSISTANT_API_BASE as string | undefined)?.replace(/\/$/, '') ?? DEFAULT_API_BASE;

function websocketUrl(path: string) {
  const url = new URL(path, ASSISTANT_API_BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Assistant API error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) message = String(body.detail);
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function mapBackendStateToMode(state: string | undefined): AIMode {
  if (state === 'thinking') return 'thinking';
  if (state === 'speaking') return 'responding';
  if (state === 'listening' || state === 'transcribing') return 'listening';
  return 'idle';
}

export async function sendText(message: string, sessionId?: string | null): Promise<AssistantTurn> {
  const response = await fetch(`${ASSISTANT_API_BASE}/chat/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId ?? undefined }),
  });
  return parseResponse<AssistantTurn>(response);
}

export async function sendVoice(audio: Blob, sessionId?: string | null): Promise<AssistantTurn> {
  const formData = new FormData();
  const extension = audio.type.includes('webm') ? 'webm' : audio.type.includes('mp4') ? 'mp4' : 'wav';
  formData.append('file', audio, `voice-command.${extension}`);

  const url = new URL(`${ASSISTANT_API_BASE}/chat/voice`);
  if (sessionId) url.searchParams.set('session_id', sessionId);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  return parseResponse<AssistantTurn>(response);
}

export function subscribeToAssistantEvents(
  onEvent: (event: AssistantEvent) => void,
  onStatus?: (status: 'connected' | 'disconnected' | 'error') => void,
) {
  const socket = new WebSocket(websocketUrl('/events'));
  socket.onopen = () => onStatus?.('connected');
  socket.onclose = () => onStatus?.('disconnected');
  socket.onerror = () => onStatus?.('error');
  socket.onmessage = event => {
    try {
      onEvent(JSON.parse(event.data) as AssistantEvent);
    } catch {
      onStatus?.('error');
    }
  };
  return () => socket.close();
}

export function playTurnAudio(turn: AssistantTurn) {
  const encoded = turn.audio?.audio_base64;
  const mimeType = turn.audio?.mime_type ?? 'audio/mpeg';
  if (!encoded) return;

  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const audio = new Audio(objectUrl);
  audio.onended = () => URL.revokeObjectURL(objectUrl);
  audio.onerror = () => URL.revokeObjectURL(objectUrl);
  void audio.play();
}

