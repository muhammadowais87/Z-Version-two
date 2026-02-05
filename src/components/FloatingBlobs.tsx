const FloatingBlobs = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Main background - dark teal */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, hsl(170 50% 6%) 0%, hsl(168 45% 10%) 50%, hsl(165 40% 12%) 100%)',
        }}
      />

      {/* Large bright blob - bottom left (main cyan glow) */}
      <div 
        className="absolute -bottom-20 -left-20 w-[500px] h-[500px]"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(165 90% 60% / 0.8), hsl(165 80% 50% / 0.5) 35%, hsl(165 70% 40% / 0.2) 55%, transparent 70%)',
          filter: 'blur(40px)',
          animation: 'blobMove1 20s ease-in-out infinite',
        }}
      />

      {/* Top dark blob */}
      <div 
        className="absolute -top-32 left-1/3 w-[450px] h-[450px]"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(165 50% 35% / 0.7), hsl(170 45% 25% / 0.4) 45%, transparent 70%)',
          filter: 'blur(50px)',
          animation: 'blobMove2 25s ease-in-out infinite',
        }}
      />

      {/* Right side blob */}
      <div 
        className="absolute top-1/4 -right-16 w-[400px] h-[500px]"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(168 45% 30% / 0.8), hsl(170 40% 22% / 0.4) 50%, transparent 70%)',
          filter: 'blur(45px)',
          animation: 'blobMove3 22s ease-in-out infinite',
        }}
      />

      {/* Center mint glow (smaller, brighter) */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[180px] h-[180px]"
        style={{
          background: 'radial-gradient(circle, hsl(165 95% 65% / 0.9), hsl(165 85% 55% / 0.4) 45%, transparent 65%)',
          filter: 'blur(25px)',
          animation: 'blobPulse 8s ease-in-out infinite',
        }}
      />

      {/* Bottom right blob */}
      <div 
        className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px]"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(165 55% 38% / 0.6), hsl(170 50% 28% / 0.3) 50%, transparent 70%)',
          filter: 'blur(50px)',
          animation: 'blobMove4 18s ease-in-out infinite',
        }}
      />

      {/* Mid-left blob */}
      <div 
        className="absolute top-1/2 -left-10 w-[300px] h-[380px]"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(165 60% 42% / 0.6), hsl(170 55% 32% / 0.3) 50%, transparent 70%)',
          filter: 'blur(45px)',
          animation: 'blobMove5 24s ease-in-out infinite',
        }}
      />

      {/* Small floating orbs */}
      <div 
        className="absolute top-1/3 right-1/3 w-[100px] h-[100px]"
        style={{
          background: 'radial-gradient(circle, hsl(165 95% 65% / 0.7), transparent 55%)',
          filter: 'blur(15px)',
          animation: 'blobFloat 6s ease-in-out infinite',
        }}
      />
      <div 
        className="absolute bottom-1/3 left-1/4 w-[80px] h-[80px]"
        style={{
          background: 'radial-gradient(circle, hsl(165 90% 60% / 0.6), transparent 55%)',
          filter: 'blur(12px)',
          animation: 'blobFloat 5s ease-in-out infinite 1s',
        }}
      />

      {/* CSS Keyframes */}
      <style>{`
        @keyframes blobMove1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -40px) scale(1.1); }
          50% { transform: translate(-20px, 30px) scale(0.95); }
          75% { transform: translate(40px, 20px) scale(1.05); }
        }
        @keyframes blobMove2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, 30px) scale(1.08); }
          66% { transform: translate(30px, -20px) scale(0.92); }
        }
        @keyframes blobMove3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-30px, 50px) scale(1.12); }
          50% { transform: translate(20px, -30px) scale(0.88); }
          75% { transform: translate(-20px, -20px) scale(1.05); }
        }
        @keyframes blobMove4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, -40px) scale(1.15); }
        }
        @keyframes blobMove5 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(25px, -35px) scale(1.1); }
          66% { transform: translate(-15px, 25px) scale(0.9); }
        }
        @keyframes blobPulse {
          0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.9; }
          50% { transform: translate(-50%, -15px) scale(1.2); opacity: 1; }
        }
        @keyframes blobFloat {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-20px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default FloatingBlobs;
