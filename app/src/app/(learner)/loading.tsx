import { Skeleton } from "@/components/ui/skeleton";

export default function LearnerLoading() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-24 w-full max-w-md" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
