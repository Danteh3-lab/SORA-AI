import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, KeyRound, LoaderCircle, Save, X } from "lucide-react";

export interface AssistantSettings {
  llm_provider: string;
  stt_provider: string;
  tts_provider: string;
  llm_model: string;
  stt_model: string;
  tts_model: string;
  tts_voice: string;
  openai_base_url: string;
  nvidia_base_url: string;
  has_openai_api_key: boolean;
  has_nvidia_api_key: boolean;
}

interface SettingsForm extends AssistantSettings {
  openai_api_key: string;
  nvidia_api_key: string;
}

interface SettingsModalProps {
  apiBaseUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (settings: AssistantSettings) => void;
}

const inputStyle = {
  background: "rgba(2, 8, 20, 0.88)",
  border: "1px solid rgba(0, 229, 255, 0.16)",
  color: "#b3e5fc",
};

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail || `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

function StatusBadge({ saved }: { saved: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        background: saved ? "rgba(16,185,129,0.09)" : "rgba(244,63,94,0.08)",
        border: `1px solid ${saved ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.22)"}`,
        color: saved ? "#6ee7b7" : "#fb7185",
        fontFamily: "DM Mono, monospace",
        fontSize: 8,
        letterSpacing: "0.12em",
      }}
    >
      {saved ? <Check size={9} /> : <KeyRound size={9} />}
      {saved ? "SAVED" : "NOT SET"}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        style={{
          color: "#3d6b8c",
          fontFamily: "DM Mono, monospace",
          fontSize: 9,
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function SettingsModal({ apiBaseUrl, open, onOpenChange, onSaved }: SettingsModalProps) {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    setIsError(false);

    fetch(`${apiBaseUrl}/settings`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response));
        }
        return response.json() as Promise<AssistantSettings>;
      })
      .then((settings) => {
        setForm({ ...settings, openai_api_key: "", nvidia_api_key: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setIsError(true);
          setMessage(error instanceof Error ? error.message : "Unable to load settings.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, open]);

  useEffect(() => {
    if (!open || !window.speechSynthesis) {
      return;
    }

    const loadVoices = () => setBrowserVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [open]);

  const update = (key: keyof SettingsForm, value: string) => {
    setForm((current) => {
      if (!current) {
        return current;
      }
      if (key === "llm_provider" && value === "nvidia_nim" && current.llm_model === "gpt-4o-mini") {
        return { ...current, llm_provider: value, llm_model: "meta/llama-3.3-70b-instruct" };
      }
      if (
        key === "llm_provider" &&
        value === "openai" &&
        current.llm_model === "meta/llama-3.3-70b-instruct"
      ) {
        return { ...current, llm_provider: value, llm_model: "gpt-4o-mini" };
      }
      if (key === "stt_provider" && value === "nvidia_nim") {
        return { ...current, stt_provider: value, stt_model: "nvidia/nemotron-asr-streaming" };
      }
      if (key === "tts_provider" && value === "browser") {
        return { ...current, tts_provider: value, tts_model: "browser-speech" };
      }
      return { ...current, [key]: value };
    });
  };

  const save = async () => {
    if (!form) {
      return;
    }

    setSaving(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch(`${apiBaseUrl}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const settings = (await response.json()) as AssistantSettings;
      setForm({ ...settings, openai_api_key: "", nvidia_api_key: "" });
      setMessage("Settings saved. Provider core rebuilt.");
      onSaved(settings);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "rgba(0, 3, 12, 0.76)", backdropFilter: "blur(10px)" }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              onOpenChange(false);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            style={{
              background: "linear-gradient(155deg, rgba(5,15,32,0.98), rgba(2,6,18,0.98))",
              border: "1px solid rgba(0,229,255,0.2)",
              boxShadow: "0 0 60px rgba(0,180,255,0.14), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div
              className="flex items-start justify-between px-6 py-5"
              style={{ borderBottom: "1px solid rgba(0,229,255,0.09)" }}
            >
              <div>
                <p style={{ color: "#00e5ff", fontFamily: "DM Mono, monospace", fontSize: 12, letterSpacing: "0.2em" }}>
                  CORE CONFIGURATION
                </p>
                <p className="mt-1" style={{ color: "#3d6b8c", fontFamily: "DM Mono, monospace", fontSize: 9 }}>
                  Credentials stay in the backend key store and are never returned to the browser.
                </p>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-full p-2 transition-colors hover:bg-white/5"
                style={{ color: "#3d6b8c" }}
                aria-label="Close settings"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin" }}>
              {loading || !form ? (
                <div className="flex h-56 items-center justify-center gap-2" style={{ color: "#29b6f6" }}>
                  <LoaderCircle className="animate-spin" size={16} />
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10 }}>READING CORE SETTINGS</span>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <section className="grid gap-4 md:grid-cols-3">
                    <Field label="LLM PROVIDER">
                      <select
                        value={form.llm_provider}
                        onChange={(event) => update("llm_provider", event.target.value)}
                        className="h-10 rounded-lg px-3 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="fake">Fake / local test</option>
                        <option value="openai">OpenAI</option>
                        <option value="nvidia_nim">NVIDIA NIM</option>
                      </select>
                    </Field>
                    <Field label="STT PROVIDER">
                      <select
                        value={form.stt_provider}
                        onChange={(event) => update("stt_provider", event.target.value)}
                        className="h-10 rounded-lg px-3 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="fake">Fake / local test</option>
                        <option value="openai">OpenAI</option>
                        <option value="nvidia_nim">NVIDIA Nemotron ASR</option>
                      </select>
                    </Field>
                    <Field label="TTS PROVIDER">
                      <select
                        value={form.tts_provider}
                        onChange={(event) => update("tts_provider", event.target.value)}
                        className="h-10 rounded-lg px-3 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="fake">Fake / local test</option>
                        <option value="openai">OpenAI</option>
                        <option value="browser">Browser voice</option>
                      </select>
                    </Field>
                  </section>

                  <section className="grid gap-4 md:grid-cols-2">
                    <div
                      className="rounded-xl p-4"
                      style={{ background: "rgba(0,229,255,0.025)", border: "1px solid rgba(0,229,255,0.1)" }}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span style={{ color: "#80d8ff", fontFamily: "DM Mono, monospace", fontSize: 10 }}>OPENAI</span>
                        <StatusBadge saved={form.has_openai_api_key} />
                      </div>
                      <div className="flex flex-col gap-3">
                        <Field label="API KEY">
                          <input
                            type="password"
                            value={form.openai_api_key}
                            onChange={(event) => update("openai_api_key", event.target.value)}
                            placeholder={form.has_openai_api_key ? "Leave blank to keep saved key" : "sk-..."}
                            className="h-10 rounded-lg px-3 text-sm outline-none"
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="BASE URL">
                          <input
                            value={form.openai_base_url}
                            onChange={(event) => update("openai_base_url", event.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="h-10 rounded-lg px-3 text-sm outline-none"
                            style={inputStyle}
                          />
                        </Field>
                      </div>
                    </div>

                    <div
                      className="rounded-xl p-4"
                      style={{ background: "rgba(118,185,0,0.025)", border: "1px solid rgba(118,185,0,0.16)" }}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span style={{ color: "#a3e635", fontFamily: "DM Mono, monospace", fontSize: 10 }}>NVIDIA NIM</span>
                        <StatusBadge saved={form.has_nvidia_api_key} />
                      </div>
                      <div className="flex flex-col gap-3">
                        <Field label="API KEY">
                          <input
                            type="password"
                            value={form.nvidia_api_key}
                            onChange={(event) => update("nvidia_api_key", event.target.value)}
                            placeholder={form.has_nvidia_api_key ? "Leave blank to keep saved key" : "nvapi-..."}
                            className="h-10 rounded-lg px-3 text-sm outline-none"
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="BASE URL">
                          <input
                            value={form.nvidia_base_url}
                            onChange={(event) => update("nvidia_base_url", event.target.value)}
                            className="h-10 rounded-lg px-3 text-sm outline-none"
                            style={inputStyle}
                          />
                        </Field>
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-4 md:grid-cols-2">
                    <Field label="LLM MODEL">
                      <input
                        value={form.llm_model}
                        onChange={(event) => update("llm_model", event.target.value)}
                        className="h-10 rounded-lg px-3 text-sm outline-none"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="STT MODEL">
                      <input
                        value={form.stt_model}
                        onChange={(event) => update("stt_model", event.target.value)}
                        className="h-10 rounded-lg px-3 text-sm outline-none"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="TTS MODEL">
                      <input
                        value={form.tts_model}
                        onChange={(event) => update("tts_model", event.target.value)}
                        className="h-10 rounded-lg px-3 text-sm outline-none"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="TTS VOICE">
                      {form.tts_provider === "browser" ? (
                        <select
                          value={form.tts_voice}
                          onChange={(event) => update("tts_voice", event.target.value)}
                          className="h-10 rounded-lg px-3 text-sm outline-none"
                          style={inputStyle}
                        >
                          <option value="default">System default</option>
                          {form.tts_voice &&
                            !browserVoices.some(
                              (voice) => voice.voiceURI === form.tts_voice || voice.name === form.tts_voice,
                            ) && <option value={form.tts_voice}>{form.tts_voice} (unavailable)</option>}
                          {browserVoices.map((voice) => (
                            <option key={voice.voiceURI} value={voice.voiceURI}>
                              {voice.name} ({voice.lang})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={form.tts_voice}
                          onChange={(event) => update("tts_voice", event.target.value)}
                          className="h-10 rounded-lg px-3 text-sm outline-none"
                          style={inputStyle}
                        />
                      )}
                    </Field>
                  </section>
                </div>
              )}
            </div>

            <div
              className="flex min-h-16 items-center justify-between gap-4 px-6 py-4"
              style={{ borderTop: "1px solid rgba(0,229,255,0.09)" }}
            >
              <p
                style={{
                  color: isError ? "#fb7185" : "#6ee7b7",
                  fontFamily: "DM Mono, monospace",
                  fontSize: 9,
                }}
              >
                {message}
              </p>
              <button
                onClick={() => void save()}
                disabled={!form || loading || saving}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 disabled:opacity-40"
                style={{
                  background: "rgba(0,229,255,0.1)",
                  border: "1px solid rgba(0,229,255,0.28)",
                  color: "#80d8ff",
                  fontFamily: "DM Mono, monospace",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                }}
              >
                {saving ? <LoaderCircle className="animate-spin" size={13} /> : <Save size={13} />}
                SAVE SETTINGS
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
