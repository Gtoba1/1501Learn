import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted">
          The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <LinkButton href="/dashboard">Go to dashboard</LinkButton>
          <LinkButton href="/" variant="ghost">
            Go home
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
