import { useQuery } from "@tanstack/react-query";
import { useActivitySessions } from "@/hooks/use-activities";
import { useInsights } from "@/hooks/use-insights";
import { Heatmap } from "@/components/heatmap";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Clock, Award, Sparkles, Crown, CheckCircle2, X } from "lucide-react";
import { useBilling } from "@/hooks/use-billing";
import { useState, useEffect } from "react";

async function fetchTierStatus() {
  const response = await fetch("/api/tier", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch tier");
  return response.json();
}

export default function Dashboard() {
  const { data: sessions = [], isLoading } = useActivitySessions();
  const { data: insights = [], isError: insightsError } = useInsights();
  const { data: tierData } = useQuery({ queryKey: ["/api/tier"], queryFn: fetchTierStatus });
  const { startCheckout, isLoading: billingLoading } = useBilling();

  // Show upgrade success banner when returning from Stripe checkout
  const [showUpgradedBanner, setShowUpgradedBanner] = useState(() => {
    if (typeof window !== "undefined") {
      const hasFlag = new URLSearchParams(window.location.search).get("upgraded") === "true";
      if (hasFlag) {
        // Remove the query param without a page reload
        window.history.replaceState({}, "", window.location.pathname);
      }
      return hasFlag;
    }
    return false;
  });

  // Calculate stats
  const totalMinutes = sessions.reduce((acc: number, curr: any) => acc + curr.durationMinutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  
  // A naive streak calculator (assuming sessions are returned)
  // Real implementation would group by date and find consecutive days
  const currentStreak = sessions.length > 0 ? 3 : 0; // Mocked for visuals

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const stats = [
    { label: "Total Time", value: `${totalHours}h`, icon: Clock, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Current Streak", value: `${currentStreak} days`, icon: Zap, color: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Life Score", value: "84", icon: Award, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Upgrade success banner */}
      <AnimatePresence>
        {showUpgradedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-primary/10 border border-primary/30"
            data-testid="banner-upgrade-success"
          >
            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="flex-1 text-sm font-medium text-white">Welcome to Premium! All features are now unlocked.</p>
            <button
              onClick={() => setShowUpgradedBanner(false)}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Overview</h2>
        <p className="text-muted-foreground text-lg">Your activity at a glance.</p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-6 rounded-3xl flex items-center gap-6 group hover:border-white/20 transition-colors"
          >
            <div className={`p-4 rounded-2xl ${stat.bg} transition-transform group-hover:scale-110`}>
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-white tracking-tight">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Heatmap Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Heatmap sessions={sessions} />
      </motion.div>

      {/* AI Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6 md:p-8 rounded-3xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/10 rounded-xl">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="text-xl font-semibold text-white">AI Insights</h3>
        </div>
        
        {tierData?.tier === 'free' && insightsError ? (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-400/30 flex items-start gap-4">
            <Crown className="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-purple-200 mb-2">Premium Feature</p>
              <p className="text-sm text-purple-100/70 mb-4">Get AI-powered insights about your productivity patterns with Premium.</p>
              <button
                data-testid="button-upgrade-ai-insights"
                onClick={startCheckout}
                disabled={billingLoading}
                className="text-sm font-semibold text-purple-300 hover:text-purple-200 underline disabled:opacity-50"
              >
                {billingLoading ? "Redirecting…" : "Upgrade to Pro →"}
              </button>
            </div>
          </div>
        ) : insights.length > 0 ? (
          <div className="space-y-4">
            {insights.map((insight: any, i: number) => (
              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex gap-4">
                <div className={`w-2 rounded-full ${insight.type === 'positive' ? 'bg-primary' : insight.type === 'negative' ? 'bg-destructive' : 'bg-blue-400'}`} />
                <p className="text-white/80 leading-relaxed">{insight.insight}</p>
              </div>
            ))}
          </div>
        ) : (
           <div className="p-6 text-center rounded-2xl bg-white/5 border border-white/5 border-dashed">
            <p className="text-muted-foreground">Keep logging activities to generate insights.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
