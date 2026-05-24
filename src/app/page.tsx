import { Button } from "@/components/ui/button"
import { HomeEnergyIntakeForm } from "@/components/site/HomeEnergyIntakeForm"
import { ArrowRight, ChevronDown, Flame, HomeIcon, MapPin, PlugZap, ShieldCheck, Sun, Zap } from "lucide-react"
import Link from "next/link"
import { PixelCard } from "@/components/site/PixelCard"

export default function Home() {
  const images = {
    hero: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=2000&auto=format&fit=crop",
    solar: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1600&auto=format&fit=crop",
    ev: "https://images.unsplash.com/photo-1660921008681-3e0474ce2cf5?q=80&w=1600&auto=format&fit=crop",
    heatPump: "https://images.unsplash.com/photo-1621245089308-466d7bd49208?q=80&w=1600&auto=format&fit=crop",
  }

  return (
    <div className="min-h-screen bg-[#04090c] text-white selection:bg-amber-300/30 selection:text-white">
      
      {/* GLOBAL NAV */}
      <nav className="absolute left-0 right-0 top-0 z-50 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 text-slate-950 shadow-[0_0_20px_rgba(245,185,66,0.2)]">
            <Zap className="h-5 w-5 fill-slate-950" />
          </div>
          <span className="font-display text-lg font-black tracking-[0.2em] text-white">HELIO CAP</span>
        </div>
        <div className="hidden items-center gap-8 text-xs font-bold uppercase tracking-widest text-white/60 md:flex">
          <a href="#how-it-works" className="transition-colors hover:text-white">Process</a>
          <a href="#ecosystem" className="transition-colors hover:text-white">Ecosystem</a>
          <a href="#services" className="transition-colors hover:text-white">Upgrades</a>
        </div>
        <Link href="/admin">
          <Button size="sm" variant="outline" className="border-white/10 bg-black/20 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md hover:bg-white/10 hover:text-white">
            Login
          </Button>
        </Link>
      </nav>

      <main>
        {/* 1. HERO SECTION */}
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
          <div className="absolute inset-0 z-0">
            <img src={images.hero} alt="Luxury modern home at dusk" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#04090c] via-[#04090c]/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#04090c] via-transparent to-[#04090c]/40" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 md:px-10">
            <div className="max-w-3xl space-y-8 animate-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200 backdrop-blur-sm">
                <ShieldCheck className="h-4 w-4" />
                Premium Energy Upgrades
              </div>

              <h1 className="font-display text-6xl font-black leading-[0.95] tracking-tight text-white md:text-8xl">
                Your home energy plan <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">starts with your roof.</span>
              </h1>
              
              <p className="max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
                See whether your home qualifies for solar, EV charging, and high-efficiency heating upgrades — packaged into one personalized proposal.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <a href="#qualify">
                  <Button className="h-14 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-8 text-sm font-bold uppercase tracking-widest text-slate-950 shadow-[0_0_40px_rgba(245,185,66,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(245,185,66,0.5)]">
                    Check My Home
                    <ArrowRight className="ml-3 h-4 w-4" />
                  </Button>
                </a>
                <a href="#how-it-works">
                  <Button variant="outline" className="h-14 rounded-full border-white/10 bg-white/5 px-8 text-sm font-bold uppercase tracking-widest text-white backdrop-blur-md transition-all hover:bg-white/10">
                    See How It Works
                  </Button>
                </a>
              </div>
            </div>
          </div>

          <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 opacity-50 animate-scroll-hint">
            <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white">Scroll</span>
            <ChevronDown className="h-4 w-4 text-white" />
          </div>
        </section>

        {/* 2. SCROLL STORYTELLING */}
        <section id="how-it-works" className="relative border-t border-white/5 bg-[#04090c] py-32">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,185,66,0.03),transparent_70%)]" />
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">
                One address.<br/>One unified plan.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-white/50">
                HelioCap turns your address and monthly energy bill into a precise, personalized home energy blueprint. No guessing, no fragmented contractor pitches. Just clean math and premium design.
              </p>
            </div>

            {/* PROCESS VISUAL SEQUENCE */}
            <div className="mt-24 grid gap-6 md:grid-cols-5">
              {[
                { step: "01", title: "Enter Address", desc: "Locate your roof" },
                { step: "02", title: "Add Bill", desc: "Provide monthly usage" },
                { step: "03", title: "Preview", desc: "View solar render" },
                { step: "04", title: "Compare", desc: "Analyze estimated savings" },
                { step: "05", title: "Book", desc: "Schedule home review" },
              ].map((item, i) => (
                <div key={item.step} className="group relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-all hover:bg-white/[0.04]">
                  <div className="font-mono text-3xl font-light text-white/10 transition-colors group-hover:text-amber-300/30">{item.step}</div>
                  <div className="mt-8">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white">{item.title}</h3>
                    <p className="mt-2 text-xs text-white/40">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. IMAGE-LED PRODUCT SECTIONS */}
        <section id="services" className="bg-[#04090c]">
          
          {/* SOLAR */}
          <div className="group relative h-[80vh] min-h-[600px] w-full overflow-hidden">
            <div className="absolute inset-0 transition-transform duration-1000 group-hover:scale-105">
              <img src={images.solar} alt="Solar Panels" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#04090c] via-[#04090c]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#04090c] via-transparent to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 p-8 md:p-16 max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200 backdrop-blur-md">
                <Sun className="h-3 w-3" /> Core Generation
              </div>
              <h2 className="font-display text-5xl font-black text-white md:text-7xl">Solar Energy</h2>
              <p className="mt-6 text-lg text-white/70">
                Solar can reduce grid usage by producing electricity on-site. Estimated savings depend on roof layout, sun exposure, system size, electricity rates, and usage.
              </p>
            </div>
          </div>

          {/* EV CHARGING */}
          <div className="group relative h-[80vh] min-h-[600px] w-full overflow-hidden">
            <div className="absolute inset-0 transition-transform duration-1000 group-hover:scale-105">
              <img src={images.ev} alt="EV Charging" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#04090c] via-[#04090c]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-l from-[#04090c] via-transparent to-transparent" />
            </div>
            <div className="absolute bottom-0 right-0 p-8 md:p-16 max-w-2xl text-left md:text-right">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200 backdrop-blur-md">
                <PlugZap className="h-3 w-3" /> Infrastructure
              </div>
              <h2 className="font-display text-5xl font-black text-white md:text-7xl">EV Charging</h2>
              <p className="mt-6 text-lg text-white/70">
                Home charging can reduce reliance on gas/public charging and adds convenience. Estimated savings depend on driving distance, gas prices, EV efficiency, electricity rates, and charging habits.
              </p>
            </div>
          </div>

          {/* HEAT PUMPS */}
          <div className="group relative h-[80vh] min-h-[600px] w-full overflow-hidden">
            <div className="absolute inset-0 transition-transform duration-1000 group-hover:scale-105">
              <img src={images.heatPump} alt="Heat Pump" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#04090c] via-[#04090c]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#04090c] via-transparent to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 p-8 md:p-16 max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-md">
                <Flame className="h-3 w-3" /> Climate Control
              </div>
              <h2 className="font-display text-5xl font-black text-white md:text-7xl">Heat Pumps</h2>
              <p className="mt-6 text-lg text-white/70">
                Heat pumps can reduce heating/cooling costs and improve comfort. Estimated savings depend on current heating system, home insulation, equipment sizing, climate, and electricity/gas rates.
              </p>
            </div>
          </div>
        </section>

        {/* 4. PARTNER ECOSYSTEM (Pixel Cards) */}
        <section id="ecosystem" className="relative border-y border-white/5 bg-[#04090c] py-32">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="mb-16">
              <h2 className="font-display text-4xl font-black tracking-tight text-white md:text-5xl">
                Premium Partner Ecosystem
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-white/50">
                A unified upgrade requires best-in-class execution across disciplines.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <PixelCard 
                title="Firefly Solar"
                description="Solar design, installation planning, and clean energy savings."
                colors={['#f5b942', '#d99028', '#fbbf24', '#fcd34d']}
              />
              <PixelCard 
                title="EV Charging Partner"
                description="Level 2 home charging readiness, panel review, and install planning."
                colors={['#0ea5e9', '#38bdf8', '#7dd3fc', '#0284c7']}
              />
              <PixelCard 
                title="Heat Pump Partner"
                description="High-efficiency heating and cooling upgrades for year-round comfort."
                colors={['#10b981', '#34d399', '#6ee7b7', '#059669']}
              />
            </div>
          </div>
        </section>

        {/* 5. FINAL CTA (Integration with existing intake form component) */}
        <section id="qualify" className="relative flex min-h-[90vh] items-center justify-center bg-[#020507] py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,185,66,0.05),transparent_40%)]" />
          
          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 md:px-10">
            <div className="mb-16 text-center">
              <h2 className="font-display text-5xl font-black tracking-tight text-white md:text-7xl">
                Get My Home Energy Plan
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-white/50">
                Enter your address and monthly energy bill. We’ll prepare a personalized upgrade preview before a final home review.
              </p>
            </div>

            <div className="mx-auto max-w-2xl">
              {/* Use the existing intake form inside our luxury container */}
              <HomeEnergyIntakeForm />
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-white/5 bg-[#020507] py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 text-xs uppercase tracking-widest text-white/30 md:flex-row md:px-10">
          <div className="flex items-center gap-3">
            <Zap className="h-4 w-4 text-amber-500/50" />
            <span className="font-bold text-white/50">HELIO CAP</span>
          </div>
          <p>© {new Date().getFullYear()} Helio Cap. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
