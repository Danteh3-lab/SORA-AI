import { motion, AnimatePresence } from 'motion/react';
import { Activity, Cpu, Zap, Brain, Network, Database, Ear, Loader, Volume2, Circle } from 'lucide-react';
import type { AIMode } from '../App';

const MODE_CONFIG: Record<AIMode, { label: string; color: string; icon: typeof Circle; description: string }> = {
  idle:       { label: 'STANDBY',    color: 'text-blue-400',   icon: Circle,   description: 'Awaiting command' },
  listening:  { label: 'LISTENING',  color: 'text-cyan-400',   icon: Ear,      description: 'Capturing input...' },
  thinking:   { label: 'PROCESSING', color: 'text-violet-400', icon: Loader,   description: 'Neural synthesis active' },
  responding: { label: 'RESPONDING', color: 'text-amber-400',  icon: Volume2,  description: 'Transmitting output' },
};

export function UIPanels({ mode }: { mode: AIMode }) {
  const cfg = MODE_CONFIG[mode];
  const ModeIcon = cfg.icon;

  const systemStats = [
    { label: 'Neural Nodes',   value: mode === 'thinking' ? '52,041' : '47,832', icon: Brain,    trend: '+12.4%' },
    { label: 'Processing',     value: mode === 'thinking' ? '99.9%'  : '94.7%',  icon: Cpu,      trend: mode === 'thinking' ? 'PEAK' : 'Optimal' },
    { label: 'Network',        value: '847 Gb/s',                                icon: Network,  trend: '+8.2%' },
    { label: 'Quantum Cores',  value: '128',                                     icon: Zap,      trend: 'Active' },
    { label: 'Data Flow',      value: mode === 'responding' ? '4.1 PB/s' : '2.4 PB/s', icon: Database, trend: '+15.8%' },
    { label: 'Activity',       value: mode === 'idle' ? '72.1%' : '99.2%',       icon: Activity, trend: mode === 'idle' ? 'Low' : 'Peak' },
  ];

  const borderColor = mode === 'listening' ? 'border-cyan-500/20'
    : mode === 'thinking' ? 'border-violet-500/20'
    : mode === 'responding' ? 'border-amber-500/20'
    : 'border-blue-500/10';

  return (
    <>
      {/* Top Bar */}
      <motion.div
        className={`absolute top-0 left-0 right-0 h-20 border-b ${borderColor} backdrop-blur-sm`}
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 100%)' }}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="flex items-center justify-between h-full px-8">
          <div className="flex items-center gap-4">
            <motion.div
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(59,130,246,0.5)',
                  '0 0 40px rgba(139,92,246,0.8)',
                  '0 0 20px rgba(59,130,246,0.5)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Brain className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
                SORA
              </h1>
              <p className="text-xs text-blue-400/60">Neural Operating System v4.7</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Mode indicator */}
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                className={`px-4 py-2 rounded-lg border ${borderColor} bg-black/30 flex items-center gap-2`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  animate={mode !== 'idle' ? { rotate: mode === 'thinking' ? 360 : 0 } : {}}
                  transition={mode === 'thinking' ? { duration: 1.2, repeat: Infinity, ease: 'linear' } : {}}
                >
                  <ModeIcon className={`w-4 h-4 ${cfg.color}`} />
                </motion.div>
                <span className={`text-sm ${cfg.color} tracking-widest`}>{cfg.label}</span>
                {mode !== 'idle' && (
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-current"
                    style={{ color: 'inherit' }}
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            <motion.div
              className="px-4 py-2 rounded-lg border border-green-500/30 bg-green-500/5"
              animate={{ borderColor: ['rgba(34,197,94,0.3)', 'rgba(34,197,94,0.6)', 'rgba(34,197,94,0.3)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm text-green-400">System Online</span>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Left Panel */}
      <motion.div
        className="absolute left-0 top-24 bottom-28 w-72 p-6 border-r border-blue-500/10 backdrop-blur-sm"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%)' }}
        initial={{ x: -400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <h2 className="text-xs font-semibold text-blue-400/80 mb-4 tracking-widest">SYSTEM METRICS</h2>
        <div className="space-y-3">
          {systemStats.slice(0, 3).map((stat, index) => (
            <motion.div
              key={stat.label}
              className="p-4 rounded-lg border border-blue-500/10 bg-blue-500/5"
              animate={mode === 'thinking' ? { borderColor: ['rgba(139,92,246,0.15)', 'rgba(139,92,246,0.4)', 'rgba(139,92,246,0.15)'] } : {}}
              transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.3 }}
            >
              <div className="flex items-start justify-between mb-2">
                <stat.icon className="w-5 h-5 text-blue-400" />
                <span className="text-xs text-green-400">{stat.trend}</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={stat.value}
                  className="text-2xl font-bold text-white mb-1"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                >
                  {stat.value}
                </motion.div>
              </AnimatePresence>
              <div className="text-xs text-blue-400/60">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Right Panel */}
      <motion.div
        className="absolute right-0 top-24 bottom-28 w-72 p-6 border-l border-violet-500/10 backdrop-blur-sm"
        style={{ background: 'linear-gradient(270deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%)' }}
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <h2 className="text-xs font-semibold text-violet-400/80 mb-4 tracking-widest">NEURAL ACTIVITY</h2>
        <div className="space-y-3">
          {systemStats.slice(3).map((stat, index) => (
            <motion.div
              key={stat.label}
              className="p-4 rounded-lg border border-violet-500/10 bg-violet-500/5"
              animate={mode === 'responding' ? { borderColor: ['rgba(251,191,36,0.1)', 'rgba(251,191,36,0.35)', 'rgba(251,191,36,0.1)'] } : {}}
              transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.4 }}
            >
              <div className="flex items-start justify-between mb-2">
                <stat.icon className="w-5 h-5 text-violet-400" />
                <span className="text-xs text-green-400">{stat.trend}</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={stat.value}
                  className="text-2xl font-bold text-white mb-1"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                >
                  {stat.value}
                </motion.div>
              </AnimatePresence>
              <div className="text-xs text-violet-400/60">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Mode description */}
        <AnimatePresence>
          {mode !== 'idle' && (
            <motion.div
              className="mt-6 p-3 rounded-lg border border-white/5 bg-white/3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <p className={`text-xs ${cfg.color} tracking-wider`}>{cfg.description}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
