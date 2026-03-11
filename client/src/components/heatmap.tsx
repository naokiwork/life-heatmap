import { format, subDays, eachDayOfInterval, startOfToday, isSameDay } from "date-fns";
import { motion } from "framer-motion";

interface HeatmapProps {
  sessions: any[];
}

export function Heatmap({ sessions }: HeatmapProps) {
  const today = startOfToday();
  const startDate = subDays(today, 181); // approx 6 months
  
  const days = eachDayOfInterval({ start: startDate, end: today });

  // Map to easily lookup durations
  const sessionMap = new Map<string, number>();
  sessions?.forEach((s) => {
    // Assuming date comes back as ISO string or Date
    const d = format(new Date(s.date || s.startTime), "yyyy-MM-dd");
    sessionMap.set(d, (sessionMap.get(d) || 0) + s.durationMinutes);
  });

  const getIntensityClass = (minutes: number) => {
    if (minutes === 0) return "bg-white/5 border border-white/5";
    if (minutes < 30) return "bg-primary/30 border border-primary/20";
    if (minutes < 60) return "bg-primary/50 border border-primary/40";
    if (minutes < 120) return "bg-primary/80 border border-primary/60";
    return "bg-primary border border-primary text-primary-foreground shadow-[0_0_12px_rgba(16,185,129,0.4)]";
  };

  return (
    <div className="glass-card p-6 md:p-8 rounded-3xl overflow-x-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white tracking-tight">Activity Heatmap</h3>
          <p className="text-sm text-muted-foreground mt-1">Last 6 months of logged activity</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-[3px] bg-white/5" />
            <div className="w-3 h-3 rounded-[3px] bg-primary/30" />
            <div className="w-3 h-3 rounded-[3px] bg-primary/60" />
            <div className="w-3 h-3 rounded-[3px] bg-primary" />
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="flex gap-2 min-w-max">
        {/* Months labels could go here, simplifying for clean aesthetic */}
        <div className="grid grid-rows-7 grid-flow-col gap-[6px]">
          {days.map((day, i) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const mins = sessionMap.get(dateStr) || 0;
            return (
              <motion.div
                key={dateStr}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (i % 30) * 0.01, duration: 0.2 }}
                className={`w-4 h-4 rounded-[4px] transition-all hover:scale-125 hover:z-10 cursor-pointer ${getIntensityClass(mins)}`}
                title={`${format(day, "MMM d, yyyy")}: ${mins} mins`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
