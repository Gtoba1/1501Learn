"use client";

import { skipModule } from "@/actions/progress";
import { Button } from "@/components/ui/button";
import { useToastAction } from "@/hooks/use-toast-action";

export function SkipModuleButton({
  moduleId,
  courseSlug,
  moduleTitle,
}: {
  moduleId: string;
  courseSlug: string;
  moduleTitle: string;
}) {
  const action = skipModule.bind(null, moduleId, courseSlug);
  const [, formAction] = useToastAction(action, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Skip "${moduleTitle}"? You can still open its lessons any time if you change your mind.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="ghost" className="w-auto px-3 py-1.5 text-xs">
        Skip this module
      </Button>
    </form>
  );
}
