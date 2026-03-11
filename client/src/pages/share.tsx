import { useAuth } from "@/hooks/use-auth";
import { useActivitySessions } from "@/hooks/use-activities";
import { Heatmap } from "@/components/heatmap";
import { ActivitySquare, Download } from "lucide-react";
import { motion } from "framer-motion";

export default function Share() {
  const { user } = useAuth();
  const { data: sessions = [], isLoading } = useActivitySessions();

  if (isLoading) return <div className="p-20 text-center animate-pulse">Loading Card...</div>;

  const totalMinutes = sessions.reduce((acc: number, curr: any) => acc + curr.durationMinutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);

  return (
    <div className="space-y-8 flex flex-col items-center">
      <header className="text-center w-full max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">Share Your Progress</h2>
        <button className="px-6 py-3 rounded-full bg-white/10 text-white font-medium hover:bg-white/20 transition-all flex items-center gap-2 mx-auto">
          <Download className="w-4 h-4" /> Screenshot to Share
        </button>
      </header>

      {/* The Shareable Card element */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/10 rounded-[40px] p-10 md:p-14 shadow-2xl relative overflow-hidden"
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                <ActivitySquare className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{user?.firstName || 'User'}'s Journey</h3>
                <p className="text-muted-foreground text-sm">Life Heatmap 2025</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black text-white tracking-tighter">{totalHours} <span className="text-xl text-muted-foreground font-semibold">hrs</span></p>
              <p className="text-sm font-medium text-primary">Invested time</p>
            </div>
          </div>

          <Heatmap sessions={sessions} />
          
          <div className="mt-8 flex justify-center text-xs text-muted-foreground/50 tracking-widest uppercase font-semibold">
            Generated via Life Heatmap
          </div>
        </div>
      </motion.div>
    </div>
  );
}
