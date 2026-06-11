import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MicOff, Settings, Square, Volume2, VolumeX } from "lucide-react";
import { JARVISSphere, type OrbState } from "./components/JARVISSphere";
import { HoloPanels } from "./components/HoloPanels";
import { StarField } from "./components/StarField";
import { SettingsModal, type AssistantSettings } from "./components/SettingsModal";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";
const SPEECH_THRESHOLD = 0.025;
const SILENCE_AFTER_SPEECH_MS = 1200;
const NO_SPEECH_TIMEOUT_MS = 12000;
const LISTEN_AGAIN_DELAY_MS = 450;

interface AssistantAudioPayload {
  audio_base64: string;
  mime_type: string;
  model?: string | null;
  provider?: string | null;
}

interface AssistantTurnPayload {
  session_id: string;
  user_text: string;
  assistant_text: string;
  state_history: string[];
  audio?: AssistantAudioPayload;
}

function decodeBase64Audio(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function convertToNvidiaWav(blob: Blob): Promise<Blob> {
  const targetRate = 16000;
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeMonoWav(rendered.getChannelData(0), targetRate);
  } finally {
    await context.close();
  }
}

export default function App() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [liveText, setLiveText] = useState("Boot sequence complete.");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("");
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(true);

  const requestAbortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntentRef = useRef<"send" | "discard">("send");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const microphoneContextRef = useRef<AudioContext | null>(null);
  const silenceFrameRef = useRef<number | null>(null);
  const listenAgainTimerRef = useRef<number | null>(null);
  const handsFreeRef = useRef(true);
  const settingsOpenRef = useRef(false);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => setMousePos({ x: event.clientX, y: event.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    handsFreeRef.current = handsFreeEnabled;
  }, [handsFreeEnabled]);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const payload = (await response.json()) as {
          ok: boolean;
          config?: { llm_provider?: string; tts_voice?: string };
        };
        const provider = payload.config?.llm_provider || "assistant";
        setTtsVoice(payload.config?.tts_voice || "");
        setBackendOnline(payload.ok);
        setLiveText(
          payload.ok
            ? `Connected to local core (${provider}).`
            : "Assistant API reported an unhealthy status.",
        );
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setBackendOnline(false);
        setLiveText("Assistant API offline. Start the backend on port 8000.");
      }
    }

    void loadHealth();

    return () => controller.abort();
  }, []);

  const stopAudioPlayback = useCallback(() => {
    window.speechSynthesis?.cancel();
    speechRef.current = null;
    if (!audioRef.current) {
      return;
    }
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
  }, []);

  const clearListenAgainTimer = useCallback(() => {
    if (listenAgainTimerRef.current === null) {
      return;
    }
    window.clearTimeout(listenAgainTimerRef.current);
    listenAgainTimerRef.current = null;
  }, []);

  const scheduleHandsFreeListening = useCallback(
    (delay = LISTEN_AGAIN_DELAY_MS) => {
      if (!handsFreeRef.current || settingsOpenRef.current) {
        return;
      }
      if (recorderRef.current || requestAbortRef.current || speechRef.current || audioRef.current) {
        return;
      }

      clearListenAgainTimer();
      listenAgainTimerRef.current = window.setTimeout(() => {
        listenAgainTimerRef.current = null;
        if (!handsFreeRef.current || settingsOpenRef.current) {
          return;
        }
        if (recorderRef.current || requestAbortRef.current || speechRef.current || audioRef.current) {
          return;
        }
        void startListeningRef.current?.();
      }, delay);
    },
    [clearListenAgainTimer],
  );

  const speakWithBrowser = useCallback((text: string) => {
    if (isMuted || !window.speechSynthesis) {
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.voiceURI === ttsVoice || voice.name === ttsVoice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.onend = () => {
      speechRef.current = null;
      setOrbState("idle");
      setLiveText(handsFreeRef.current ? "Voice detection active." : "Standing by.");
      scheduleHandsFreeListening();
    };
    utterance.onerror = () => {
      speechRef.current = null;
      setOrbState("idle");
      setLiveText("Browser voice unavailable.");
      scheduleHandsFreeListening();
    };
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  }, [isMuted, scheduleHandsFreeListening, ttsVoice]);

  const releaseStream = useCallback(() => {
    if (silenceFrameRef.current !== null) {
      cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }
    if (microphoneContextRef.current) {
      void microphoneContextRef.current.close();
      microphoneContextRef.current = null;
    }
    if (!streamRef.current) {
      return;
    }
    for (const track of streamRef.current.getTracks()) {
      track.stop();
    }
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearListenAgainTimer();
      requestAbortRef.current?.abort();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      releaseStream();
      stopAudioPlayback();
    };
  }, [clearListenAgainTimer, releaseStream, stopAudioPlayback]);

  useEffect(() => {
    if (!isMuted) {
      return;
    }
    if (!audioRef.current) {
      return;
    }
    stopAudioPlayback();
    setOrbState("idle");
    setLiveText("Audio muted.");
  }, [isMuted, stopAudioPlayback]);

  const playAssistantAudio = useCallback(
    async (audioPayload: AssistantAudioPayload) => {
      if (isMuted) {
        return false;
      }

      stopAudioPlayback();

      const blob = decodeBase64Audio(audioPayload.audio_base64, audioPayload.mime_type);
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);

      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        setOrbState("idle");
        setLiveText(handsFreeRef.current ? "Voice detection active." : "Standing by.");
        scheduleHandsFreeListening();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        setOrbState("idle");
        setLiveText("Audio playback unavailable.");
        scheduleHandsFreeListening();
      };

      try {
        await audio.play();
        return true;
      } catch {
        URL.revokeObjectURL(objectUrl);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        return false;
      }
    },
    [isMuted, scheduleHandsFreeListening, stopAudioPlayback],
  );

  const handleTurn = useCallback(
    async (turn: AssistantTurnPayload) => {
      setSessionId(turn.session_id);
      setBackendOnline(true);
      setLiveText("Voice response ready.");

      if (turn.audio?.mime_type === "text/plain" && speakWithBrowser(turn.assistant_text)) {
        setOrbState("speaking");
        return;
      }

      if (turn.audio && (await playAssistantAudio(turn.audio))) {
        setOrbState("speaking");
        return;
      }

      setOrbState("idle");
      scheduleHandsFreeListening();
    },
    [playAssistantAudio, scheduleHandsFreeListening, speakWithBrowser],
  );

  const reportRequestError = useCallback(
    (fallbackText: string, backendReached = false) => {
      setBackendOnline(backendReached);
      setOrbState("idle");
      setLiveText(fallbackText);
    },
    [],
  );

  const reportLocalError = useCallback(
    (message: string) => {
      setOrbState("idle");
      setLiveText(message);
    },
    [],
  );

  const sendVoice = useCallback(
    async (blob: Blob) => {
      const controller = new AbortController();
      requestAbortRef.current = controller;
      setOrbState("speaking");
      setLiveText("Transcribing...");

      try {
        const formData = new FormData();
        const extension = blob.type.includes("wav") ? "wav" : "webm";
        formData.append("file", blob, `voice-input.${extension}`);

        const endpoint = new URL(`${API_BASE_URL}/chat/voice`);
        if (sessionId) {
          endpoint.searchParams.set("session_id", sessionId);
        }

        const response = await fetch(endpoint, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { detail?: string };
          reportRequestError(payload.detail || `Voice request failed with ${response.status}`, true);
          requestAbortRef.current = null;
          return;
        }

        const turn = (await response.json()) as AssistantTurnPayload;
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
        await handleTurn(turn);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        requestAbortRef.current = null;
        reportRequestError("Voice request failed. Confirm microphone access and backend availability.");
      }
    },
    [handleTurn, reportRequestError, sessionId],
  );

  const stopListening = useCallback((sendRecording: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recordIntentRef.current = sendRecording ? "send" : "discard";
    setLiveText(sendRecording ? "Transcribing..." : "Listening cancelled.");
    setOrbState(sendRecording ? "speaking" : "idle");
    recorder.stop();
  }, []);

  const startListening = useCallback(async () => {
    stopAudioPlayback();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recordIntentRef.current = "send";

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const shouldSend = recordIntentRef.current === "send";
        const mimeType = recorder.mimeType || "audio/webm";
        const chunks = [...audioChunksRef.current];

        recorderRef.current = null;
        audioChunksRef.current = [];
        releaseStream();

        if (!shouldSend) {
          setLiveText(handsFreeRef.current ? "Voice detection active." : "Standing by.");
          scheduleHandsFreeListening();
          return;
        }

        if (chunks.length === 0) {
          reportLocalError("No microphone audio was captured. Try again.");
          return;
        }

        void convertToNvidiaWav(new Blob(chunks, { type: mimeType }))
          .then(sendVoice)
          .catch(() => reportLocalError("Unable to prepare microphone audio for speech recognition."));
      };

      recorder.start();
      const microphoneContext = new AudioContext();
      const analyser = microphoneContext.createAnalyser();
      analyser.fftSize = 1024;
      microphoneContext.createMediaStreamSource(stream).connect(analyser);
      microphoneContextRef.current = microphoneContext;

      const samples = new Float32Array(analyser.fftSize);
      const listeningStartedAt = performance.now();
      let heardSpeech = false;
      let lastSpeechAt = listeningStartedAt;

      const detectSilence = () => {
        if (recorder.state === "inactive") {
          return;
        }

        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((total, sample) => total + sample * sample, 0) / samples.length,
        );
        const now = performance.now();

        if (rms >= SPEECH_THRESHOLD) {
          heardSpeech = true;
          lastSpeechAt = now;
          setLiveText("Listening...");
        } else if (heardSpeech && now - lastSpeechAt >= SILENCE_AFTER_SPEECH_MS) {
          recordIntentRef.current = "send";
          setLiveText("Silence detected. Transcribing...");
          setOrbState("speaking");
          recorder.stop();
          return;
        } else if (!heardSpeech && now - listeningStartedAt >= NO_SPEECH_TIMEOUT_MS) {
          recordIntentRef.current = "discard";
          setLiveText("Voice detection active.");
          setOrbState("idle");
          recorder.stop();
          return;
        }

        silenceFrameRef.current = requestAnimationFrame(detectSilence);
      };
      silenceFrameRef.current = requestAnimationFrame(detectSilence);
      setBackendOnline(true);
      setOrbState("listening");
      setLiveText("Voice detection active.");
    } catch {
      releaseStream();
      setHandsFreeEnabled(false);
      reportLocalError("Microphone access was denied or unavailable in this browser.");
    }
  }, [releaseStream, reportLocalError, scheduleHandsFreeListening, sendVoice, stopAudioPlayback]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  useEffect(() => {
    if (backendOnline !== true || !handsFreeEnabled || settingsOpen) {
      return;
    }
    scheduleHandsFreeListening(900);
  }, [backendOnline, handsFreeEnabled, scheduleHandsFreeListening, settingsOpen]);

  const interrupt = useCallback(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    stopAudioPlayback();
    setOrbState("idle");
    setLiveText(handsFreeRef.current ? "Interrupted. Voice detection active." : "Interrupted.");
    scheduleHandsFreeListening();
  }, [scheduleHandsFreeListening, stopAudioPlayback]);

  const handleOrbClick = useCallback(() => {
    if (orbState === "listening") {
      stopListening(true);
      return;
    }
    if (orbState === "speaking") {
      interrupt();
      return;
    }
    setHandsFreeEnabled(true);
    void startListening();
  }, [interrupt, orbState, startListening, stopListening]);

  const isListening = orbState === "listening";
  const isSpeaking = orbState === "speaking";

  const statusColor = isSpeaking ? "#00e5ff" : isListening ? "#40c4ff" : "#1565c0";
  const statusText = isSpeaking ? "RESPONDING" : isListening ? "LISTENING" : "STANDBY";

  const handleSettingsSaved = useCallback((settings: AssistantSettings) => {
    setBackendOnline(true);
    setTtsVoice(settings.tts_voice);
    setLiveText(`Core reconfigured: ${settings.llm_provider}.`);
  }, []);

  return (
    <div
      className="relative flex flex-col h-screen w-full overflow-hidden select-none"
      style={{ background: "#020510", fontFamily: "Inter, sans-serif" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(10,20,60,0.55) 0%, rgba(2,5,16,0.9) 65%, #020510 100%)",
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,50,120,0.08) 0%, transparent 70%)",
        }}
      />

      <StarField mouseX={mousePos.x} mouseY={mousePos.y} />

      <header
        className="relative z-30 flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(0,229,255,0.07)" }}
      >
        <div className="flex flex-col">
          <span
            className="tracking-[0.25em]"
            style={{ fontFamily: "DM Mono, monospace", color: "#00e5ff", fontSize: 12, opacity: 0.85 }}
          >
            AURA
          </span>
          <span
            style={{ fontFamily: "DM Mono, monospace", color: "#1e3a5f", fontSize: 9, letterSpacing: "0.15em" }}
          >
            ADVANCED UNIFIED REASONING AGENT
          </span>
        </div>

        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(0,229,255,0.05)",
            border: "1px solid rgba(0,229,255,0.12)",
          }}
        >
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span
            style={{ fontFamily: "DM Mono, monospace", fontSize: 10, letterSpacing: "0.15em", color: statusColor }}
          >
            {statusText}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsOpen(true)}
            className="cursor-pointer transition-colors hover:text-[#00e5ff]"
            style={{ color: "#1e3a5f" }}
            aria-label="Open settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => setIsMuted((value) => !value)}
            className="cursor-pointer transition-colors"
            style={{ color: isMuted ? "#f43f5e" : "#1e3a5f" }}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div
            className="w-1 h-1 rounded-full"
            style={{
              background: backendOnline === false ? "#f43f5e" : "#00e5ff",
              boxShadow: `0 0 6px ${backendOnline === false ? "#f43f5e" : "#00e5ff"}`,
            }}
          />
        </div>
      </header>

      <div className="relative z-20 flex-1 min-h-0">
        <JARVISSphere
          state={orbState}
          onClick={handleOrbClick}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
        />

        <HoloPanels
          isListening={isListening}
          isSpeaking={isSpeaking}
          liveText={liveText}
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 mt-52">
            <motion.p
              key={liveText}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-center max-w-[280px] leading-relaxed"
              style={{
                fontFamily: "DM Mono, monospace",
                color: isSpeaking ? "#b3e5fc" : isListening ? "#80d8ff" : "#1e3a5f",
                textShadow: isSpeaking || isListening ? `0 0 24px ${statusColor}66` : "none",
                fontSize: 10,
                letterSpacing: "0.08em",
              }}
            >
              {liveText}
            </motion.p>

            <AnimatePresence>
              {isListening && (
                <motion.button
                  key="cancel"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => stopListening(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer pointer-events-auto"
                  style={{
                    background: "rgba(64,196,255,0.07)",
                    border: "1px solid rgba(64,196,255,0.22)",
                    color: "#40c4ff",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                  }}
                >
                  <MicOff size={10} /> CANCEL
                </motion.button>
              )}
              {isSpeaking && (
                <motion.button
                  key="interrupt"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={interrupt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer pointer-events-auto"
                  style={{
                    background: "rgba(244,63,94,0.07)",
                    border: "1px solid rgba(244,63,94,0.22)",
                    color: "#f43f5e",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                  }}
                >
                  <Square size={9} fill="#f43f5e" /> INTERRUPT
                </motion.button>
              )}
              {orbState === "idle" && (
                <motion.p
                  key="tap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.35 }}
                  exit={{ opacity: 0 }}
                  style={{ fontFamily: "DM Mono, monospace", color: "#29b6f6", fontSize: 9, letterSpacing: "0.2em" }}
                >
                  {handsFreeEnabled ? "VOICE DETECTION ARMED" : "TAP ORB TO BEGIN VOICE LINK"}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div
        className="relative z-30 flex flex-shrink-0 items-center justify-center px-5 py-4"
        style={{
          borderTop: "1px solid rgba(0,229,255,0.06)",
          background: "linear-gradient(180deg, rgba(2,5,16,0), rgba(0,18,38,0.18))",
        }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 10px ${statusColor}` }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span
            style={{
              fontFamily: "DM Mono, monospace",
              color: isListening || isSpeaking ? "#80d8ff" : "#1e3a5f",
              fontSize: 9,
              letterSpacing: "0.18em",
            }}
          >
            {isListening
              ? "VOICE DETECTION ACTIVE / AUTO-SENDS AFTER SILENCE"
              : isSpeaking
                ? "AURA TRANSMITTING / TAP ORB TO INTERRUPT"
                : handsFreeEnabled
                  ? "VOICE DETECTION READY"
                  : "VOICE LINK READY"}
          </span>
        </div>
      </div>

      <SettingsModal
        apiBaseUrl={API_BASE_URL}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={handleSettingsSaved}
      />
    </div>
  );
}
