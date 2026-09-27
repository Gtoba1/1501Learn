import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 max-w-6xl">
          <Logo href="/dashboard" />
          <nav className="flex flex-1 gap-4 text-sm font-semibold">
            <Link href="/dashboard" className="text-ink">
              Dashboard
            </Link>
            <Link href="/profile" className="text-ink">
              Profile
            </Link>
            {profile?.role === "admin" && (
              <Link href="/admin" className="text-ink">
                Admin
              </Link>
            )}
          </nav>
          <span className="text-sm text-muted">{profile?.full_name}</span>
          <SignOutButton />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        {children}
      </main>
    </>
  );
}
