import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Tags, 
  Timer, 
  Share2, 
  LogOut,
  Menu,
  ActivitySquare
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/categories", label: "Categories", icon: Tags },
    { href: "/logger", label: "Activity Timer", icon: Timer },
    { href: "/share", label: "Share Card", icon: Share2 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 glass-card border-l-0 border-y-0 rounded-none bg-black/50">
        <div className="p-6 flex items-center gap-3 text-primary">
          <div className="p-2 bg-primary/10 rounded-xl">
            <ActivitySquare className="w-6 h-6" />
          </div>
          <h1 className="font-semibold tracking-tight text-xl text-white">Heatmap</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const active = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  active 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 mb-4">
            <p className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
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
      <header className="md:hidden fixed top-0 inset-x-0 h-16 glass z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-primary">
          <ActivitySquare className="w-6 h-6" />
          <h1 className="font-semibold text-lg text-white">Heatmap</h1>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-white">
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-20 px-4"
          >
            <nav className="space-y-2">
              {navItems.map((item) => (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-4 rounded-xl ${
                    location === item.href 
                      ? "bg-white/10 text-white" 
                      : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="font-medium text-lg">{item.label}</span>
                </Link>
              ))}
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
