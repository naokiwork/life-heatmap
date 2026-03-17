import { useState } from "react";
import { useGoals, useCreateGoal, useDeleteGoal } from "@/hooks/use-goals";
import { useCategories } from "@/hooks/use-categories";
import { motion } from "framer-motion";
import { Crown, Target, Trash2, Plus, CheckCircle2 } from "lucide-react";
import { useBilling } from "@/hooks/use-billing";

function PremiumWall() {
  const { startCheckout, isLoading } = useBilling();
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-6">
      <div className="p-5 rounded-full bg-amber-400/10 border border-amber-400/20">
        <Crown className="w-12 h-12 text-amber-400" />
      </div>
      <div>
        <h3 className="text-2xl font-bold text-white mb-2">Goal Tracking is Premium</h3>
        <p className="text-muted-foreground max-w-sm">Set ambitious targets and watch your progress unfold. Available with Premium.</p>
      </div>
      <button
        data-testid="button-upgrade-goals"
        onClick={startCheckout}
        disabled={isLoading}
        className="px-6 py-3 rounded-xl bg-amber-400 text-black font-semibold hover:bg-amber-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? "Redirecting…" : "Upgrade to Pro — $3/mo"}
      </button>
    </div>
  );
}

export default function Goals() {
  const { data: goals = [], isError, isLoading } = useGoals();
  const { data: categories = [] } = useCategories();
  const createGoal = useCreateGoal();
  const deleteGoal = useDeleteGoal();

  const [name, setName] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [deadline, setDeadline] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetHours) return;
    createGoal.mutate({
      name,
      categoryId: categoryId ? Number(categoryId) : null,
      targetMinutes: Math.round(parseFloat(targetHours) * 60),
      deadline: deadline || null,
    }, { onSuccess: () => { setName(""); setTargetHours(""); setCategoryId(""); setDeadline(""); } });
  };

  if (isLoading) return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (isError) return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Goals</h2>
        <p className="text-muted-foreground text-lg">Set targets and track your progress.</p>
      </header>
      <div className="glass-card rounded-3xl p-8"><PremiumWall /></div>
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Goals</h2>
        <p className="text-muted-foreground text-lg">Set ambitious targets and watch your progress unfold.</p>
      </header>

      <div className="grid md:grid-cols-[1fr_2fr] gap-8 items-start">
        {/* Create Form */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="glass-card p-6 md:p-8 rounded-3xl">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> New Goal
          </h3>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Goal name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. 500 coding hours this year"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Target (hours)</label>
              <input type="number" value={targetHours} onChange={e => setTargetHours(e.target.value)}
                placeholder="e.g. 500"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Category (optional)</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary transition-all">
                <option value="">All categories</option>
                {(categories as any[]).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Deadline (optional)</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary transition-all" />
            </div>
            <button type="submit" disabled={createGoal.isPending || !name.trim() || !targetHours}
              className="w-full flex justify-center items-center gap-2 py-4 rounded-xl font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-50 transition-all active:scale-[0.98]">
              {createGoal.isPending ? "Adding..." : <><Plus className="w-5 h-5" /> Add Goal</>}
            </button>
          </form>
        </motion.div>

        {/* Goals List */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          {goals.length === 0 ? (
            <div className="glass-card p-12 rounded-3xl text-center flex flex-col items-center justify-center">
              <Target className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground text-lg">No goals yet. Set your first target!</p>
            </div>
          ) : (
            (goals as any[]).map((goal: any, i: number) => {
              const done = goal.progress >= 100;
              return (
                <motion.div key={goal.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`glass-card p-5 rounded-2xl group hover:border-white/20 transition-all ${done ? 'border-primary/30' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {done && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                        <h4 className="font-semibold text-white">{goal.name}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {goal.category ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: goal.category.color }} />
                            {goal.category.name}
                          </span>
                        ) : 'All activities'}
                      </p>
                    </div>
                    <button onClick={() => deleteGoal.mutate(goal.id)}
                      className="p-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{Math.round(goal.actualMinutes / 60 * 10) / 10}h / {Math.round(goal.targetMinutes / 60 * 10) / 10}h</span>
                      <span className={`font-semibold ${done ? 'text-primary' : 'text-white'}`}>{goal.progress}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${goal.progress}%`, backgroundColor: done ? '#10B981' : '#3B82F6' }} />
                    </div>
                    {goal.deadline && (
                      <p className="text-xs text-muted-foreground">Due: {new Date(goal.deadline).toLocaleDateString()}</p>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </div>
    </div>
  );
}
