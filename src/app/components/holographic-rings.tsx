import { motion } from 'motion/react';

export function HolographicRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Outer ring */}
      <motion.div
        className="absolute rounded-full border-2 border-blue-500/20"
        style={{
          width: '70%',
          aspectRatio: '1',
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.2), inset 0 0 40px rgba(59, 130, 246, 0.1)',
        }}
        animate={{
          rotate: 360,
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.8)]" />
      </motion.div>

      {/* Middle ring */}
      <motion.div
        className="absolute rounded-full border-2 border-violet-500/20"
        style={{
          width: '85%',
          aspectRatio: '1',
          boxShadow: '0 0 50px rgba(139, 92, 246, 0.2), inset 0 0 50px rgba(139, 92, 246, 0.1)',
        }}
        animate={{
          rotate: -360,
        }}
        transition={{
          duration: 50,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <div className="absolute top-1/4 right-0 translate-x-1/2 w-3 h-3 bg-violet-400 rounded-full shadow-[0_0_25px_rgba(139,92,246,0.8)]" />
        <div className="absolute bottom-1/4 left-0 -translate-x-1/2 w-2 h-2 bg-violet-400 rounded-full shadow-[0_0_20px_rgba(139,92,246,0.8)]" />
      </motion.div>

      {/* Outer ring with grid */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '100%',
          aspectRatio: '1',
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(59, 130, 246, 0.05) 10deg, transparent 20deg, transparent 90deg, rgba(139, 92, 246, 0.05) 100deg, transparent 110deg, transparent 180deg, rgba(59, 130, 246, 0.05) 190deg, transparent 200deg, transparent 270deg, rgba(139, 92, 246, 0.05) 280deg, transparent 290deg, transparent 360deg)',
          border: '1px solid rgba(59, 130, 246, 0.1)',
          boxShadow: '0 0 60px rgba(59, 130, 246, 0.15), inset 0 0 60px rgba(139, 92, 246, 0.1)',
        }}
        animate={{
          rotate: 360,
        }}
        transition={{
          duration: 60,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
}
