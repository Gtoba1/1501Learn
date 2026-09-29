"use client";

import { useFormStatus } from "react-dom";
import { chooseTrack } from "@/actions/tracks";
import { Button } from "@/components/ui/button";
import { useToastAction } from "@/hooks/use-toast-action";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Please wait…" : label}
    </Button>
  );
}

export function ChooseTrackButton({
  courseId,
  courseSlug,
  courseTitle,
  currentTitle,
}: {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  // The learner's current track, if they already have one.
  currentTitle: string | null;
}) {
  const [, formAction] = useToastAction(chooseTrack.bind(null, courseId, courseSlug), null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          currentTitle &&
          !window.confirm(
            `Switch from ${currentTitle} to ${courseTitle}? You can only follow one track at a time. Your progress in ${currentTitle} is saved, so you can switch back later.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Submit label={currentTitle ? `Switch to this track` : `Start this track`} />
    </form>
  );
}
