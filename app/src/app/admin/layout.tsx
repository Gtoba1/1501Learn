import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { AdminSidebarNav } from "@/components/admin/admin-sidebar-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
      >
        Skip to content
      </a>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="flex flex-col gap-3 border-b border-line bg-surface px-4 py-3 md:min-h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0 md:sticky md:top-0 md:py-6">
          <Logo href="/admin" subtitle="Admin" />
          <AdminSidebarNav />
          <div className="hidden md:mt-auto md:block">
            <Link href="/dashboard" className="block px-3 py-2 text-sm font-semibold text-muted">
              Learner view
            </Link>
            <div className="px-3">
              <SignOutButton />
            </div>
          </div>
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/dashboard" className="text-sm font-semibold text-muted">
              Learner view
            </Link>
            <SignOutButton />
          </div>
        </aside>
        <main id="main" className="w-full flex-1 px-5 py-8 md:px-8">
          {children}
        </main>
      </div>
    </>
  );
}
