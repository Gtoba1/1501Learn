"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  OverviewIcon,
  LearnersIcon,
  CoursesIcon,
  CohortsIcon,
  SubmissionsIcon,
} from "@/components/admin/icons";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", Icon: OverviewIcon, exact: true },
  { href: "/admin/learners", label: "Learners", Icon: LearnersIcon },
  { href: "/admin/courses", label: "Courses", Icon: CoursesIcon },
  { href: "/admin/cohorts", label: "Cohorts", Icon: CohortsIcon },
  { href: "/admin/submissions", label: "Submissions", Icon: SubmissionsIcon },
  { href: "/admin/peer-review", label: "Peer review", Icon: LearnersIcon },
];

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
      {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
        const isActive = exact ? pathname === href : pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-ink/5",
              isActive && "bg-brand/10 text-brand",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
