import { useCallback, useEffect, useState } from 'react';
import { NeuralSphere } from './components/neural-sphere';
import { HolographicRings } from './components/holographic-rings';
import { EnergyParticles } from './components/energy-particles';
import { UIPanels } from './components/ui-panels';
import { GridOverlay } from './components/grid-overlay';
import { CommandInterface } from './components/command-interface';
import {
  mapBackendStateToMode,
  subscribeToAssistantEvents,
  type AIMode,
  type AssistantEvent,
} from './lib/assistant-api';

export type { AIMode } from './lib/assistant-api';

export default function App() {
  const [aiMode, setAiMode] = useState<AIMode>('idle');
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

  const triggerMode = useCallback((mode: AIMode) => {
    setAiMode(mode);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAssistantEvents(
      (event: AssistantEvent) => {
        if (event.type === 'state.changed') {
          setAiMode(mapBackendStateToMode(String(event.payload.state)));
        }
      },
      status => setApiStatus(status),
    );
    return unsubscribe;
  }, []);

  return (
    <div className="size-full relative overflow-hidden bg-black">
      <GridOverlay />
      <HolographicRings />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full">
          <NeuralSphere mode={aiMode} />
        </div>
      </div>

      <EnergyParticles />
      <UIPanels mode={aiMode} />
      <CommandInterface apiStatus={apiStatus} mode={aiMode} onModeChange={triggerMode} />

      {/* Ambient glow — color shifts with mode */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] pointer-events-none transition-all duration-1000"
        style={{
          background:
            aiMode === 'listening'
              ? 'rgba(6, 182, 212, 0.12)'
              : aiMode === 'thinking'
              ? 'rgba(139, 92, 246, 0.18)'
              : aiMode === 'responding'
              ? 'rgba(251, 191, 36, 0.10)'
              : 'rgba(59, 130, 246, 0.10)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[80px] pointer-events-none transition-all duration-1000"
        style={{
          background:
            aiMode === 'thinking'
              ? 'rgba(139, 92, 246, 0.14)'
              : aiMode === 'responding'
              ? 'rgba(251, 191, 36, 0.08)'
              : 'rgba(139, 92, 246, 0.08)',
        }}
      />
    </div>
  );
}
