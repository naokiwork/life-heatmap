import { motion } from "framer-motion";
import { ActivitySquare, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center text-center px-4">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 blur-[120px] rounded-full pointer-events-none opacity-50" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex flex-col items-center"
      >
        <div className="p-4 bg-white/5 border border-white/10 rounded-3xl mb-8 backdrop-blur-xl inline-block shadow-2xl">
          <ActivitySquare className="w-16 h-16 text-primary" />
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6 max-w-3xl">
          Visualize your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">consistency.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
          Log your daily activities, build lasting habits, and watch your progress unfold in a beautiful, GitHub-style life heatmap.
        </p>

        {/* Since Replit Auth uses /api/login, we use a standard anchor tag to redirect */}
        <a 
          href="/api/login"
          className="group relative inline-flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full font-semibold text-lg overflow-hidden transition-transform hover:scale-105 active:scale-95"
        >
          <span className="relative z-10 flex items-center gap-2">
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </span>
          <div className="absolute inset-0 bg-primary translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out z-0" />
        </a>
      </motion.div>
    </div>
  );
}
