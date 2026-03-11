import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Tags,
  Timer,
  Share2,
  LogOut,
  Menu,
  ActivitySquare,
  BarChart2,
  Target,
  Trophy,
  Crown,
  X,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

async function fetchTierStatus() {
  const res = await fetch("/api/tier", { credentials: "include" });
  if (!res.ok) return { tier: 'free' };
  return res.json();
}

const FREE_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/logger", label: "Activity Timer", icon: Timer },
  { href: "/share", label: "Share Card", icon: Share2 },
];

const PREMIUM_NAV = [
  { href: "/analytics", label: "Analytics", icon: BarChart2, premium: true },
  { href: "/goals", label: "Goals", icon: Target, premium: true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, premium: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: tierData } = useQuery({ queryKey: ["/api/tier"], queryFn: fetchTierStatus });
  const isPremium = tierData?.tier === 'premium';

  const allNav = [
    ...FREE_NAV,
    ...PREMIUM_NAV,
  ];

  const NavLink = ({ item, mobile = false }: { item: typeof allNav[0], mobile?: boolean }) => {
    const active = location === item.href;
    const isPremiumItem = (item as any).premium;
    return (
      <Link
        href={item.href}
        onClick={() => mobile && setMobileMenuOpen(false)}
        className={`flex items-center gap-3 px-4 ${mobile ? 'py-4' : 'py-3'} rounded-xl transition-all duration-300 group ${
          active
            ? "bg-white/10 text-white shadow-sm"
            : "text-muted-foreground hover:bg-white/5 hover:text-white"
        }`}
      >
        <item.icon className={`${mobile ? 'w-6 h-6' : 'w-5 h-5'} ${active ? "text-primary" : ""}`} />
        <span className={`font-medium ${mobile ? 'text-lg' : ''}`}>{item.label}</span>
        {isPremiumItem && !isPremium && (
          <Crown className="w-3.5 h-3.5 text-amber-400 ml-auto opacity-70" />
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 glass-card border-l-0 border-y-0 rounded-none bg-black/50">
        <div className="p-6 flex items-center gap-3 text-primary">
          <div className="p-2 bg-primary/10 rounded-xl">
            <ActivitySquare className="w-6 h-6" />
          </div>
          <h1 className="font-semibold tracking-tight text-xl text-white">Life Heatmap</h1>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground px-4 py-2 uppercase tracking-wider">Main</p>
          {FREE_NAV.map(item => <NavLink key={item.href} item={item} />)}

          <p className="text-xs font-semibold text-muted-foreground px-4 py-2 mt-4 uppercase tracking-wider flex items-center gap-2">
            Premium
            {!isPremium && <Crown className="w-3 h-3 text-amber-400" />}
          </p>
          {PREMIUM_NAV.map(item => <NavLink key={item.href} item={item} />)}

          {!isPremium && (
            <div className="mt-4 mx-1 p-4 rounded-2xl bg-gradient-to-br from-amber-400/10 to-amber-500/5 border border-amber-400/20">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-200">Upgrade to Pro</span>
              </div>
              <p className="text-xs text-amber-100/60 mb-3">Unlock AI insights, analytics, goals & more.</p>
              <a href="#" className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline">$3/month →</a>
            </div>
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-white/5">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 mb-3 flex items-center gap-3">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} className="w-8 h-8 rounded-full" alt="avatar" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-white text-xs font-bold">{user?.firstName?.[0] || '?'}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">{isPremium ? '⭐ Premium' : 'Free plan'}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 inset-x-0 h-16 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-primary">
          <ActivitySquare className="w-6 h-6" />
          <h1 className="font-semibold text-lg text-white">Life Heatmap</h1>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-white">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-20 px-4 overflow-y-auto"
          >
            <nav className="space-y-1 pb-8">
              <p className="text-xs font-semibold text-muted-foreground px-4 py-2 uppercase tracking-wider">Main</p>
              {FREE_NAV.map(item => <NavLink key={item.href} item={item} mobile />)}

              <p className="text-xs font-semibold text-muted-foreground px-4 py-2 mt-4 uppercase tracking-wider">Premium</p>
              {PREMIUM_NAV.map(item => <NavLink key={item.href} item={item} mobile />)}

              <button
                onClick={() => logout()}
                className="flex items-center gap-3 px-4 py-4 w-full rounded-xl text-destructive mt-4"
              >
                <LogOut className="w-6 h-6" />
                <span className="font-medium text-lg">Logout</span>
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0 min-h-screen">
        <div className="max-w-5xl mx-auto p-4 md:p-8 lg:p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
