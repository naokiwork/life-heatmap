import { useQuery } from "@tanstack/react-query";
import { useWeeklyAnalytics, useDailyAnalytics, useCategoryBreakdown } from "@/hooks/use-analytics";
import { motion } from "framer-motion";
import { Crown, BarChart2, TrendingUp, PieChart as PieIcon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";

const CHART_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F97316", "#EC4899", "#EAB308", "#F43F5E", "#6366F1"];

function PremiumWall({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-6">
      <div className="p-5 rounded-full bg-amber-400/10 border border-amber-400/20">
        <Crown className="w-12 h-12 text-amber-400" />
      </div>
      <div>
        <h3 className="text-2xl font-bold text-white mb-2">{feature} is Premium</h3>
        <p className="text-muted-foreground max-w-sm">Upgrade to Premium to unlock detailed analytics and understand your productivity patterns.</p>
      </div>
      <a href="#" className="px-6 py-3 rounded-xl bg-amber-400 text-black font-semibold hover:bg-amber-300 transition-colors">
        Upgrade to Pro — $3/mo
      </a>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black/90 border border-white/10 rounded-xl p-3 text-sm shadow-xl">
      <p className="text-white font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-white font-medium">{p.value}h</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { data: weeklyData, isError: weeklyErr } = useWeeklyAnalytics();
  const { data: dailyData, isError: dailyErr } = useDailyAnalytics(30);
  const { data: categoryData, isError: categoryErr } = useCategoryBreakdown();

  const isPremiumRequired = weeklyErr || dailyErr || categoryErr;

  if (isPremiumRequired) return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Analytics</h2>
        <p className="text-muted-foreground text-lg">Deep insights into your productivity patterns.</p>
      </header>
      <div className="glass-card rounded-3xl p-8">
        <PremiumWall feature="Analytics" />
      </div>
    </div>
  );

  // Collect all category names from weekly data for bar chart keys
  const categoryKeys = Array.from(new Set(
    (weeklyData || []).flatMap((w: any) => Object.keys(w).filter(k => k !== 'week'))
  ));

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Analytics</h2>
        <p className="text-muted-foreground text-lg">Deep insights into your productivity patterns.</p>
      </header>

      {/* Daily trend chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card p-6 md:p-8 rounded-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/10 rounded-xl"><TrendingUp className="w-5 h-5 text-blue-400" /></div>
          <h3 className="text-xl font-semibold text-white">Daily Activity — Last 30 Days</h3>
        </div>
        {dailyData && dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)} interval={4} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} unit="h" />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="hours" stroke="#10B981" strokeWidth={2}
                dot={false} activeDot={{ r: 5, fill: '#10B981' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-60 flex items-center justify-center">
            <p className="text-muted-foreground">No activity data yet. Start logging!</p>
          </div>
        )}
      </motion.div>

      {/* Weekly breakdown */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card p-6 md:p-8 rounded-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-xl"><BarChart2 className="w-5 h-5 text-primary" /></div>
          <h3 className="text-xl font-semibold text-white">Weekly Breakdown by Category</h3>
        </div>
        {weeklyData && weeklyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: '#888', fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} unit="h" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#888', fontSize: 12 }} />
              {categoryKeys.map((key, i) => (
                <Bar key={key} dataKey={key} stackId="a"
                  fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === categoryKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-60 flex items-center justify-center">
            <p className="text-muted-foreground">Log activities to see weekly breakdown.</p>
          </div>
        )}
      </motion.div>

      {/* Category pie */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass-card p-6 md:p-8 rounded-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/10 rounded-xl"><PieIcon className="w-5 h-5 text-purple-400" /></div>
          <h3 className="text-xl font-semibold text-white">All-Time Category Distribution</h3>
        </div>
        {categoryData && categoryData.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="hours" nameKey="name" paddingAngle={3}>
                  {categoryData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v}h`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {categoryData.map((cat: any, i: number) => {
                const total = categoryData.reduce((s: number, c: any) => s + c.hours, 0);
                const pct = total > 0 ? Math.round((cat.hours / total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white font-medium">{cat.name}</span>
                        <span className="text-muted-foreground">{cat.hours}h ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-60 flex items-center justify-center">
            <p className="text-muted-foreground">No data yet. Start tracking activities!</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
