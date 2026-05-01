import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BarChart3, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-border bg-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
             <Zap className="text-white w-5 h-5 fill-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">HELIO CAP</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#" className="hover:text-primary transition-colors">Solutions</a>
          <a href="#" className="hover:text-primary transition-colors">Infrastructure</a>
          <a href="#" className="hover:text-primary transition-colors">Enterprise</a>
        </div>
        <Link href="/admin">
          <Button size="sm" className="bg-accent hover:bg-[#065F46] text-white font-semibold rounded-sm px-6">
            LOGIN
          </Button>
        </Link>
      </nav>

      <main className="flex-1">
        {/* Hero Section - White Dominant */}
        <section className="px-8 py-24 md:py-32 max-w-7xl mx-auto text-left">
          <div className="max-w-3xl space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5 text-warning" />
              Enterprise Solar Infrastructure
            </div>
            <h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-[1.1]">
              Scale Your Commercial <br />
              <span className="text-muted-foreground">Solar Operations.</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
              Helio Cap provides the financial-grade infrastructure for generating, 
              managing, and deploying personalized commercial solar landing pages 
              for institutional assets.
            </p>
            <div className="flex items-center gap-4 pt-4">
              <Button size="lg" className="bg-accent hover:bg-[#065F46] text-white font-bold rounded-sm px-8 h-14 text-lg">
                GET STARTED
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button variant="outline" size="lg" className="border-border hover:bg-muted font-bold rounded-sm px-8 h-14 text-lg">
                VIEW DEMO
              </Button>
            </div>
          </div>
        </section>

        {/* Project Section - Strategic Navy Contrast */}
        <section className="bg-primary py-24 px-8">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl font-bold text-white tracking-tight">
                Project: Apex Logistics
              </h2>
              <p className="text-lg text-white/60 leading-relaxed">
                Automated roof analysis and solar render deployment for 
                Billy Bob's commercial rooftop portfolio.
              </p>
              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40">Est. Annual Savings</p>
                  <p className="text-4xl font-bold text-roi-green">$142,500+</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40">Payback Period</p>
                  <p className="text-4xl font-bold text-white">5.8 Years</p>
                </div>
              </div>
            </div>
            <Card className="bg-secondary-dark border-border/10 overflow-hidden rounded-sm shadow-2xl">
               <div className="aspect-video bg-muted flex items-center justify-center relative group">
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                  <BarChart3 className="w-12 h-12 text-white/20" />
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                       Solar Render v2.4
                    </div>
                  </div>
               </div>
               <CardContent className="p-8 space-y-4">
                  <p className="text-sm text-white/60 font-medium">
                     The Helio Cap engine automatically mapped 1,290 panels across 
                     the northern exposure, maximizing ROI for the asset owner.
                  </p>
               </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-secondary-dark py-12 px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all cursor-pointer">
            <Zap className="text-white w-4 h-4 fill-white" />
            <span className="text-xs font-bold tracking-widest text-white uppercase">HELIO CAP</span>
          </div>
          <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
            © 2026 HELIO CAP INFRASTRUCTURE. ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
}
