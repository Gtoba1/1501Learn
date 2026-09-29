import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-15 max-w-6xl flex-wrap items-center gap-4 px-5">
          <Logo />
          <span className="flex-1" />
          {user ? (
            <LinkButton href="/dashboard" variant="ghost">
              Dashboard
            </LinkButton>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-ink">
                Sign in
              </Link>
              <LinkButton href="/signup">Sign up</LinkButton>
            </>
          )}
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line py-8 text-sm text-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5">
          <span>Analytics Engineering and Data Engineering, built on ShopLink Distribution.</span>
          <div className="flex gap-4">
            <Link href="/login" className="underline">
              Sign in
            </Link>
            <Link href="/signup" className="underline">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
