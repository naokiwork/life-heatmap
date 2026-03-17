import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/hooks/use-categories";
import { motion } from "framer-motion";
import { Plus, Trash2, Tag, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";

const PRESET_COLORS = [
  "#10B981", "#3B82F6", "#8B5CF6", "#6366F1", 
  "#D946EF", "#EC4899", "#F43F5E", "#F97316", "#EAB308"
];

async function fetchTierStatus() {
  const response = await fetch("/api/tier", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch tier");
  return response.json();
}

export default function Categories() {
  const { data: categories = [], isLoading } = useCategories();
  const { data: tierData } = useQuery({ queryKey: ["/api/tier"], queryFn: fetchTierStatus });
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const { startCheckout, isLoading: billingLoading } = useBilling();

  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const canAddMore = tierData?.tier === 'premium' || (tierData?.categoryCount || 0) < 5;
  const atLimit = !canAddMore;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || atLimit) return;
    createCategory.mutate({ name, color: selectedColor }, {
      onSuccess: () => setName("")
    });
  };

  if (isLoading) return <div className="animate-pulse text-center pt-20">Loading...</div>;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Categories</h2>
        <p className="text-muted-foreground text-lg">Manage your activity types and colors.</p>
      </header>

      <div className="grid md:grid-cols-[1fr_2fr] gap-8">
        {/* Create Form */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card p-6 md:p-8 rounded-3xl h-fit"
        >
          <h3 className="text-xl font-semibold text-white mb-6">New Category</h3>
          <form onSubmit={handleCreate} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Reading, Gym, Coding"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">Color</label>
              <div className="flex flex-wrap gap-3">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-full transition-all duration-300 ${selectedColor === color ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-background' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={createCategory.isPending || !name.trim() || atLimit}
              className="w-full flex justify-center items-center gap-2 py-4 rounded-xl font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {createCategory.isPending ? "Adding..." : <><Plus className="w-5 h-5" /> Add Category</>}
            </button>
            
            {atLimit && (
              <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-start gap-3">
                <Crown className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-200 mb-2">Limit reached</p>
                  <p className="text-xs text-amber-100/70 mb-3">Free plan: 5 categories max</p>
                  <button
                    data-testid="button-upgrade-categories"
                    onClick={startCheckout}
                    disabled={billingLoading}
                    className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline disabled:opacity-50"
                  >
                    {billingLoading ? "Redirecting…" : "Upgrade to Pro →"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </motion.div>

        {/* List */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          {categories.length === 0 ? (
            <div className="glass-card p-12 rounded-3xl text-center flex flex-col items-center justify-center">
              <Tag className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground text-lg">No categories yet. Create your first one!</p>
            </div>
          ) : (
            categories.map((cat: any, i: number) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-5 rounded-2xl flex items-center justify-between group hover:border-white/20 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-4 h-12 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-lg font-medium text-white">{cat.name}</span>
                </div>
                <button
                  onClick={() => deleteCategory.mutate(cat.id)}
                  className="p-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  );
}
