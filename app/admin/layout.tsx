import { requireAdminPage } from "@/lib/adminAuth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <>
      {children}
      <form action="/api/admin/logout" method="post" className="fixed bottom-4 right-4 z-[100]">
        <button
          type="submit"
          className="border border-white/12 bg-[#1a1a1f]/95 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-stone-400 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-[#c08a4b]/50 hover:text-[#d8a866]"
        >
          Log out
        </button>
      </form>
    </>
  );
}
