import { Button } from "@/components/ui/button";
import { HomeEnergyIntakeForm } from "@/components/site/HomeEnergyIntakeForm";
import { ArrowRight, Flame, HomeIcon, PlugZap, ShieldCheck, Sun, Zap } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const bundles = [
    {
      title: "Solar first",
      description: "Use your roof and hydro bill to estimate a cleaner solar savings path.",
      icon: Sun,
    },
    {
      title: "Heat pump ready",
      description: "See whether heating upgrades belong in the same plan.",
      icon: Flame,
    },
    {
      title: "EV charging",
      description: "Plan for the car, charger, and electricity load together.",
      icon: PlugZap,
    },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#071116] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-12rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-amber-300/20 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32rem)]" />
      </div>

      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-300 text-slate-950 shadow-lg shadow-amber-300/20">
            <Zap className="h-5 w-5 fill-slate-950" />
          </div>
          <span className="text-lg font-black tracking-[0.18em]">HELIO CAP</span>
        </div>
        <div className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex">
          <a href="#proposal" className="transition-colors hover:text-amber-200">Savings check</a>
          <a href="#bundle" className="transition-colors hover:text-amber-200">Bundle</a>
          <a href="#how" className="transition-colors hover:text-amber-200">How it works</a>
        </div>
        <Link href="/admin">
          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
            Login
          </Button>
        </Link>
      </nav>

      <main>
        <section id="proposal" className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 md:px-8 lg:grid-cols-[1fr_30rem] lg:items-center lg:pb-24 lg:pt-16">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-amber-100">
              <ShieldCheck className="h-4 w-4" />
              Ontario home energy proposals
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.055em] text-white md:text-7xl">
                See what your home could save with solar, heat pumps, and EV charging.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
                Tell us about your home once. We turn your roof, hydro bill, heating setup, and EV plans into a tailored residential energy proposal.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a href="#proposal">
                <Button className="h-12 rounded-2xl bg-amber-300 px-6 text-base font-bold text-slate-950 hover:bg-amber-200">
                  Start savings check
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
              <a href="#how">
                <Button variant="outline" className="h-12 rounded-2xl border-white/15 bg-white/5 px-6 text-base font-semibold text-white hover:bg-white/10">
                  How it works
                </Button>
              </a>
            </div>

            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ["No cold scrape", "You volunteer the info"],
                ["Home bundle", "Solar + heat + EV"],
                ["Roof-aware", "Address selected by you"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-100">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <HomeEnergyIntakeForm />
        </section>

        <section id="bundle" className="border-y border-white/10 bg-white/[0.035] px-5 py-16 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-100/70">One homeowner profile</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">Stop selling products in silos.</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">
                The better pitch is a home energy plan: generation, comfort, vehicle charging, incentives, and financing in one place.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {bundles.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="group rounded-[1.75rem] border border-white/10 bg-[#08151c] p-6 transition hover:-translate-y-1 hover:border-amber-300/30">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-6 text-xl font-bold text-white">{item.title}</h3>
                    <p className="mt-3 leading-7 text-slate-400">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
              The new flow
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">Inbound beats guessing.</h2>
          </div>
          <div className="grid gap-4">
            {[
              ["01", "Homeowner submits the form", "The app saves the lead directly into the prospects table. No commercial scrape. No mystery coordinates."],
              ["02", "You qualify the bundle", "Review address, hydro bill, heating, EV status, and timeline from the admin pipeline."],
              ["03", "Then create the proposal", "Use the proposal workflow only after the homeowner has raised their hand."],
            ].map(([step, title, body]) => (
              <div key={step} className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 sm:grid-cols-[4rem_1fr]">
                <div className="text-2xl font-black text-amber-200">{step}</div>
                <div>
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-400">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-10 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-slate-500 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <HomeIcon className="h-4 w-4 text-amber-200" />
            <span className="font-bold tracking-[0.18em] text-slate-300">HELIO CAP</span>
          </div>
          <p>Residential solar, heat pump, and EV charging proposal intake.</p>
        </div>
      </footer>
    </div>
  );
}
