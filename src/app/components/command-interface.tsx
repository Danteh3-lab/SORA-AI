import { useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, Send, Square } from 'lucide-react';
import type { AIMode } from '../App';
import { ASSISTANT_API_BASE, playTurnAudio, sendText, sendVoice } from '../lib/assistant-api';

const PRESET_COMMANDS = [
  { label: 'Analyze Neural Grid', command: 'Analyze the current assistant system status.' },
  { label: 'Voice Command', command: null },
  { label: 'Broadcast Output', command: 'Give me a concise spoken-style status update.' },
];

interface Log {
  id: number;
  type: 'user' | 'sora';
  text: string;
  time: string;
}

let logId = 0;

function now() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export function CommandInterface({
  apiStatus,
  mode,
  onModeChange,
}: {
  apiStatus: 'connected' | 'disconnected' | 'error';
  mode: AIMode;
  onModeChange: (m: AIMode) => void;
}) {
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<Log[]>([
    { id: logId++, type: 'sora', text: 'SORA neural interface initialized. Awaiting command.', time: now() },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function addLog(type: 'user' | 'sora', text: string) {
    setLogs(prev => [...prev.slice(-8), { id: logId++, type, text, time: now() }]);
  }

  async function submitCommand(command?: string) {
    const cmd = (command ?? input).trim();
    if (!cmd) return;

    if (!command) setInput('');
    addLog('user', cmd);
    setIsSubmitting(true);
    onModeChange('thinking');

    try {
      const turn = await sendText(cmd, sessionId);
      setSessionId(turn.session_id);
      addLog('sora', turn.assistant_text);
    } catch (error) {
      addLog('sora', error instanceof Error ? error.message : 'Unable to reach assistant core.');
    } finally {
      setIsSubmitting(false);
      onModeChange('idle');
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      addLog('sora', 'Microphone recording is not available in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);
        void submitVoice(blob);
      };

      recorder.start();
      setIsRecording(true);
      addLog('user', 'Voice capture started.');
      onModeChange('listening');
    } catch (error) {
      addLog('sora', error instanceof Error ? error.message : 'Microphone permission was denied.');
      onModeChange('idle');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      addLog('user', 'Voice capture stopped.');
    }
  }

  async function submitVoice(blob: Blob) {
    if (!blob.size) {
      addLog('sora', 'No audio was captured.');
      onModeChange('idle');
      return;
    }

    setIsSubmitting(true);
    onModeChange('thinking');

    try {
      const turn = await sendVoice(blob, sessionId);
      setSessionId(turn.session_id);
      addLog('user', turn.user_text);
      addLog('sora', turn.assistant_text);
      playTurnAudio(turn);
    } catch (error) {
      addLog('sora', error instanceof Error ? error.message : 'Voice request failed.');
    } finally {
      setIsSubmitting(false);
      onModeChange('idle');
    }
  }

  function handleSubmit() {
    void submitCommand();
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void submitCommand();
  }

  const modeColors: Record<AIMode, string> = {
    idle: 'border-blue-500/20',
    listening: 'border-cyan-500/30',
    thinking: 'border-violet-500/30',
    responding: 'border-amber-500/30',
  };

  const isBusy = isSubmitting || (mode !== 'idle' && !isRecording);
  const statusText =
    apiStatus === 'connected'
      ? `Core linked at ${ASSISTANT_API_BASE}`
      : apiStatus === 'error'
        ? 'Core link unstable'
        : `Core waiting at ${ASSISTANT_API_BASE}`;

  return (
    <motion.div
      className={`absolute bottom-0 left-0 right-0 border-t ${modeColors[mode]} backdrop-blur-md`}
      style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 100%)' }}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
    >
      <div className="px-8 pt-3 pb-2 flex flex-col gap-1 max-h-28 overflow-hidden">
        <div className="flex items-center gap-2 pb-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              apiStatus === 'connected' ? 'bg-green-400' : apiStatus === 'error' ? 'bg-amber-400' : 'bg-blue-400/40'
            }`}
          />
          <span className="text-[10px] text-white/35 tracking-wider uppercase truncate">{statusText}</span>
        </div>

        <AnimatePresence>
          {logs.slice(-3).map(log => (
            <motion.div
              key={log.id}
              className="flex items-start gap-2"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <span className="text-xs text-blue-400/40 shrink-0 mt-0.5">{log.time}</span>
              <span className={`text-xs shrink-0 ${log.type === 'sora' ? 'text-violet-400' : 'text-cyan-400'}`}>
                {log.type === 'sora' ? 'SORA >' : 'YOU >'}
              </span>
              <span className="text-xs text-white/60 truncate">{log.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 px-8 pb-4">
        <div className="flex gap-2 shrink-0">
          {PRESET_COMMANDS.map(cmd => (
            <motion.button
              key={cmd.label}
              onClick={() => {
                if (cmd.command) {
                  void submitCommand(cmd.command);
                } else if (isRecording) {
                  stopRecording();
                } else {
                  void startRecording();
                }
              }}
              disabled={isBusy}
              className="px-3 py-1.5 rounded border border-blue-500/20 bg-blue-500/5 text-xs text-blue-400/70 hover:border-blue-400/40 hover:text-blue-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed tracking-wide"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {cmd.label}
            </motion.button>
          ))}
        </div>

        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={isBusy || isRecording}
            placeholder={mode !== 'idle' ? 'Processing...' : 'Enter neural command...'}
            className="w-full bg-white/3 border border-blue-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-blue-400/40 focus:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed pr-12"
          />

          <AnimatePresence>
            {mode === 'listening' && (
              <motion.div
                className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          onClick={() => {
            if (isRecording) {
              stopRecording();
            } else if (mode === 'idle') {
              void startRecording();
            }
          }}
          disabled={isBusy}
          className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
            isRecording
              ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-400'
              : 'border-blue-500/20 bg-blue-500/5 text-blue-400/50 hover:border-blue-400/40 hover:text-blue-300'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          animate={isRecording ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 1, repeat: Infinity }}
          whileTap={{ scale: 0.92 }}
        >
          {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </motion.button>

        <motion.button
          onClick={handleSubmit}
          disabled={!input.trim() || isBusy || isRecording}
          className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-violet-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-blue-400 hover:to-violet-500 transition-all"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
        >
          <Send className="w-4 h-4" />
        </motion.button>
      </div>

      <AnimatePresence>
        {mode !== 'idle' && (
          <motion.div
            className="absolute top-0 left-0 right-0 h-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`h-full ${
                mode === 'listening' ? 'bg-cyan-400' : mode === 'thinking' ? 'bg-violet-400' : 'bg-amber-400'
              }`}
              animate={{ width: ['0%', '100%'] }}
              transition={{
                duration: mode === 'listening' ? 12 : mode === 'thinking' ? 4 : 5,
                ease: 'linear',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

