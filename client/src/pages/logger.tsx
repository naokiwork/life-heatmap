import { useState, useEffect } from "react";
import { useCategories } from "@/hooks/use-categories";
import { useCreateActivitySession } from "@/hooks/use-activities";
import { motion } from "framer-motion";
import { Play, Square, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Logger() {
  const { data: categories = [] } = useCategories();
  const createSession = useCreateActivitySession();
  const { toast } = useToast();

  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (!selectedCat) {
      toast({ title: "Select a category first", variant: "destructive" });
      return;
    }
    setIsRunning(true);
    setStartTime(new Date());
  };

  const handleStop = () => {
    setIsRunning(false);
  };

  const handleSave = () => {
    if (!selectedCat || !startTime) return;
    const durationMinutes = Math.max(1, Math.floor(elapsedSeconds / 60)); // minimum 1 min

    createSession.mutate({
      categoryId: selectedCat,
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
      durationMinutes,
    }, {
      onSuccess: () => {
        toast({ title: "Session saved!" });
        setElapsedSeconds(0);
        setStartTime(null);
      }
    });
  };

  // Find selected category object for color
  const activeCategoryObj = categories.find((c: any) => c.id === selectedCat);
  const activeColor = activeCategoryObj?.color || "#10B981";

  // SVG Circle calculations
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  // Pulsing effect when running
  const strokeOffset = isRunning ? circumference * 0.2 : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-8">
      <header className="text-center">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Activity Timer</h2>
        <p className="text-muted-foreground text-lg">Focus on what matters right now.</p>
      </header>

      <div className="glass-card p-8 md:p-12 rounded-[40px] flex flex-col items-center">
        {/* Category Selector */}
        <div className="w-full max-w-xs mb-12">
          <select 
            disabled={isRunning || elapsedSeconds > 0}
            className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            value={selectedCat || ""}
            onChange={(e) => setSelectedCat(Number(e.target.value))}
          >
            <option value="" disabled className="bg-background text-muted-foreground">Select Activity</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id} className="bg-background text-white">{c.name}</option>
            ))}
          </select>
        </div>

        {/* Circular Timer Display */}
        <div className="relative w-72 h-72 flex items-center justify-center mb-12">
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            {/* Background circle */}
            <circle 
              cx="144" cy="144" r={radius} 
              stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" 
            />
            {/* Animated progress circle */}
            <motion.circle 
              cx="144" cy="144" r={radius} 
              stroke={activeColor} 
              strokeWidth="8" 
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ 
                strokeDashoffset: isRunning ? [0, circumference] : strokeOffset,
                opacity: isRunning ? [1, 0.5, 1] : 1
              }}
              transition={isRunning ? { 
                duration: 60, // 60s rotation
                repeat: Infinity,
                ease: "linear"
              } : { duration: 0.5 }}
            />
          </svg>
          <div className="relative z-10 flex flex-col items-center">
            <span className="text-6xl font-bold text-white tracking-tighter tabular-nums">
              {formatTime(elapsedSeconds)}
            </span>
            {activeCategoryObj && (
              <span className="mt-2 font-medium" style={{ color: activeColor }}>
                {activeCategoryObj.name}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          {!isRunning && elapsedSeconds === 0 && (
            <button 
              onClick={handleStart}
              className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              <Play className="w-8 h-8 ml-1" />
            </button>
          )}

          {isRunning && (
            <button 
              onClick={handleStop}
              className="w-20 h-20 rounded-full bg-destructive/20 text-destructive border border-destructive flex items-center justify-center hover:bg-destructive/30 hover:scale-105 active:scale-95 transition-all"
            >
              <Square className="w-8 h-8" />
            </button>
          )}

          {!isRunning && elapsedSeconds > 0 && (
            <>
              <button 
                onClick={handleStart}
                className="w-16 h-16 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all"
              >
                <Play className="w-6 h-6 ml-1" />
              </button>
              <button 
                onClick={handleSave}
                disabled={createSession.isPending}
                className="px-8 py-5 rounded-full bg-primary text-white font-semibold flex items-center gap-2 hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {createSession.isPending ? "Saving..." : "Save Session"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
