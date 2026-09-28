import { removePeerReview, removePracticeResponse } from "@/actions/admin-content";
import { SubmissionLink } from "@/components/assignments/submission-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRecentPracticeActivity } from "@/lib/data/admin-practice";

export default async function AdminPeerReviewPage() {
  const items = await getRecentPracticeActivity();

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Peer review</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">
        The latest practice answers and the feedback learners have given each other. Remove
        anything inappropriate; the learner who posted it will no longer see it.
      </p>

      {items.length === 0 ? (
        <Card className="text-muted">No practice answers yet.</Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{item.lessonTitle}</h2>
                  <p className="text-sm text-muted">
                    {item.learnerName} · {new Date(item.updatedAt).toLocaleString("en-GB")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={item.shared ? "wait" : "neutral"}>{item.shared ? "Shared" : "Private"}</Badge>
                  <form action={removePracticeResponse.bind(null, item.id)}>
                    <Button variant="danger" type="submit" className="px-2 py-0.5 text-xs">
                      Remove answer
                    </Button>
                  </form>
                </div>
              </div>
              {item.responseUrl && (
                <p className="mt-3 break-all text-sm">
                  <SubmissionLink url={item.responseUrl} />
                </p>
              )}
              {item.responseText && <p className="mt-3 whitespace-pre-wrap text-sm">{item.responseText}</p>}

              {item.reviews.length > 0 && (
                <ul className="mt-4 grid gap-2 border-t border-line pt-3">
                  {item.reviews.map((review) => (
                    <li key={review.id} className="flex items-start justify-between gap-3 rounded-lg bg-ink/5 px-3 py-2">
                      <div className="text-sm">
                        <p className="font-semibold">{review.reviewerName}</p>
                        <p className="whitespace-pre-wrap">{review.comment}</p>
                      </div>
                      <form action={removePeerReview.bind(null, review.id)}>
                        <Button variant="ghost" type="submit" className="px-2 py-0.5 text-xs">
                          Remove
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
