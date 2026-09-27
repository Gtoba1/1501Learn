type IconProps = { className?: string };

const base = "h-5 w-5 shrink-0";

export function OverviewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function LearnersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15.5 14.7c2.6.3 4.6 2.6 4.6 5.3" strokeLinecap="round" />
    </svg>
  );
}

export function CoursesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <path d="M4 5.5c1.5-1 4-1.3 6-.4v14c-2-.9-4.5-.6-6 .4v-14Z" strokeLinejoin="round" />
      <path d="M20 5.5c-1.5-1-4-1.3-6-.4v14c2-.9 4.5-.6 6 .4v-14Z" strokeLinejoin="round" />
    </svg>
  );
}

export function CohortsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M2.5 19c0-2.8 2.4-5 5.5-5s5.5 2.2 5.5 5" strokeLinecap="round" />
      <path d="M10.5 19c0-2.8 2.4-5 5.5-5s5.5 2.2 5.5 5" strokeLinecap="round" />
    </svg>
  );
}

export function SubmissionsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <path d="M5 19V10M12 19V5M19 19v-6" strokeLinecap="round" />
    </svg>
  );
}

export function QuizIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12.5l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompletedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <path
        d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 3Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActivityIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className ?? base}>
      <path d="M3 12h4l2 6 4-12 2 6h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
