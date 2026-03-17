import { useLeaderboard } from "@/hooks/use-analytics";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Crown, Trophy, Medal } from "lucide-react";
import { useBilling } from "@/hooks/use-billing";

function PremiumWall() {
  const { startCheckout, isLoading } = useBilling();
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-6">
      <div className="p-5 rounded-full bg-amber-400/10 border border-amber-400/20">
        <Crown className="w-12 h-12 text-amber-400" />
      </div>
      <div>
        <h3 className="text-2xl font-bold text-white mb-2">Leaderboard is Premium</h3>
        <p className="text-muted-foreground max-w-sm">Compare your productivity with others and climb the ranks. Available with Premium.</p>
      </div>
      <button
        data-testid="button-upgrade-leaderboard"
        onClick={startCheckout}
        disabled={isLoading}
        className="px-6 py-3 rounded-xl bg-amber-400 text-black font-semibold hover:bg-amber-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? "Redirecting…" : "Upgrade to Pro — $3/mo"}
      </button>
    </div>
  );
}

const RankIcon = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Trophy className="w-6 h-6 text-amber-400" />;
  if (rank === 2) return <Medal className="w-6 h-6 text-gray-300" />;
  if (rank === 3) return <Medal className="w-6 h-6 text-amber-600" />;
  return <span className="text-muted-foreground font-mono text-sm w-6 text-center">{rank}</span>;
};

const rankBg = (rank: number) => {
  if (rank === 1) return "border-amber-400/30 bg-amber-400/5";
  if (rank === 2) return "border-gray-300/20 bg-gray-300/5";
  if (rank === 3) return "border-amber-600/20 bg-amber-600/5";
  return "";
};

export default function Leaderboard() {
  const { data: board = [], isError, isLoading } = useLeaderboard();
  const { user } = useAuth();

  if (isLoading) return (
    <div className="h-full flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (isError) return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Leaderboard</h2>
        <p className="text-muted-foreground text-lg">Who's putting in the most work this month?</p>
      </header>
      <div className="glass-card rounded-3xl p-8"><PremiumWall /></div>
    </div>
  );

  const maxHours = (board as any[]).length > 0 ? (board as any[])[0].hours : 1;

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Leaderboard</h2>
        <p className="text-muted-foreground text-lg">Top performers — last 30 days.</p>
      </header>

      <div className="space-y-3 max-w-2xl">
        {(board as any[]).length === 0 ? (
          <div className="glass-card p-12 rounded-3xl text-center">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground text-lg">No activity recorded yet. Be the first!</p>
          </div>
        ) : (
          (board as any[]).map((entry: any, i: number) => {
            const isCurrentUser = user && entry.userId === (user as any).id;
            return (
              <motion.div key={entry.userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                data-testid={`row-leaderboard-${entry.rank}`}
                className={`glass-card p-5 rounded-2xl flex items-center gap-5 border transition-all ${rankBg(entry.rank)} ${isCurrentUser ? 'ring-1 ring-primary/50' : ''}`}>
                <div className="w-8 flex items-center justify-center flex-shrink-0">
                  <RankIcon rank={entry.rank} />
                </div>
                {entry.profileImageUrl ? (
                  <img src={entry.profileImageUrl} alt={entry.name}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">{entry.name?.[0] || '?'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-white truncate">{entry.name}</p>
                    {isCurrentUser && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">You</span>}
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-700"
                      style={{ width: `${(entry.hours / maxHours) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-white">{entry.hours}h</p>
                  <p className="text-xs text-muted-foreground">{entry.score.toLocaleString()} pts</p>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
