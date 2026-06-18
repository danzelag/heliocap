import { redirect } from "next/navigation";
import { adminAuthConfigured, hasAdminSession } from "@/lib/adminAuth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const next = firstValue(query?.next) || "/admin";
  const hasError = Boolean(firstValue(query?.error));

  if (await hasAdminSession()) {
    redirect(safeNext(next));
  }

  return (
    <main className="min-h-screen bg-[#131316] px-5 py-10 text-[#ece9e3] selection:bg-[#c08a4b]/30">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">
        <section className="w-full border border-white/[0.08] bg-[#1a1a1f] p-7 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.9)] sm:p-9">
          <div className="mb-7 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center border border-[#c08a4b]/55">
              <div className="h-3 w-3 bg-[#c08a4b]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-[0.24em]">
                AMBER<span className="text-[#c08a4b]">FIELD</span>
              </h1>
              <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-stone-500">Command center login</p>
            </div>
          </div>

          {!adminAuthConfigured() ? (
            <div className="border border-[#c8704a]/35 bg-[#c8704a]/10 p-4 text-sm leading-6 text-[#d99a82]">
              Admin login is not configured. Add <code className="font-mono">ADMIN_EMAIL</code>,{" "}
              <code className="font-mono">ADMIN_PASSWORD</code>, and{" "}
              <code className="font-mono">ADMIN_SESSION_SECRET</code> in Vercel.
            </div>
          ) : (
            <form action="/api/admin/session" method="post" className="space-y-5">
              <input type="hidden" name="next" value={safeNext(next)} />
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500">
                  Email
                </span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  autoFocus
                  className="w-full border border-white/12 bg-[#131316] px-3 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-[#c08a4b]/70"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500">
                  Password
                </span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  className="w-full border border-white/12 bg-[#131316] px-3 py-3 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-[#c08a4b]/70"
                />
              </label>
              {hasError ? (
                <p className="border border-[#c8704a]/35 bg-[#c8704a]/10 px-3 py-2 text-xs text-[#d99a82]">
                  Wrong password. Try again.
                </p>
              ) : null}
              <button
                type="submit"
                className="w-full bg-[#c08a4b] px-4 py-3 text-sm font-semibold text-[#131316] transition hover:bg-[#d8a866]"
              >
                Log in
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}
