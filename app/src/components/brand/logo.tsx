import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  subtitle,
  className,
}: {
  href?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-3", className)}>
      <Image
        src="/logo-mark.png"
        alt="1501 Learn"
        width={933}
        height={451}
        className="h-9 w-auto"
        priority
      />
      {subtitle && (
        <span className="font-display text-sm font-medium text-muted">· {subtitle}</span>
      )}
    </Link>
  );
}
