import { MarkdownContent } from "@/components/lessons/markdown-content";
import { PeerReviewForm } from "@/components/lessons/peer-review-form";
import { PracticeForm } from "@/components/lessons/practice-form";
import type { PracticeResponse } from "@/lib/data/learning";
import type { PeerPractice, PeerReview } from "@/lib/data/practice";
import { safeHttpUrl } from "@/lib/security/urls";

function ReviewList({ reviews }: { reviews: PeerReview[] }) {
  if (!reviews.length) return null;
  return (
    <ul className="mt-3 grid gap-2">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-lg bg-ink/5 px-3 py-2 text-sm">
          <p className="font-semibold">{r.mine ? "Your feedback" : r.reviewerName}</p>
          <p className="mt-0.5 whitespace-pre-wrap">{r.comment}</p>
        </li>
      ))}
    </ul>
  );
}

function AnswerBody({ text, url }: { text: string | null; url: string | null }) {
  const href = safeHttpUrl(url);
  return (
    <>
      {text && <p className="mt-1 text-sm whitespace-pre-wrap">{text}</p>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="mt-1 inline-block text-sm font-semibold break-all text-brand underline"
        >
          {href}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </>
  );
}

function PeerPanel({ peer, lessonPath }: { peer: PeerPractice; lessonPath: string }) {
  if (!peer.unlocked) {
    return (
      <p className="text-sm text-muted">
        {peer.sharedCount > 0
          ? `${peer.sharedCount} learner${peer.sharedCount === 1 ? " has" : "s have"} shared an answer. Save yours to see them and give feedback.`
          : "Save your answer to take part in peer review. Nobody has shared an answer to this task yet."}
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <h4 className="font-semibold">Feedback on your answer</h4>
        {peer.reviewsReceived.length ? (
          <ReviewList reviews={peer.reviewsReceived} />
        ) : (
          <p className="mt-1 text-sm text-muted">
            No feedback yet. Reviewing someone else&apos;s answer is the quickest way to get the
            conversation going.
          </p>
        )}
      </div>

      <div>
        <h4 className="font-semibold">Other learners&apos; answers</h4>
        {peer.peers.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            Nobody else has shared an answer yet. Check back later.
          </p>
        ) : (
          <ul className="mt-2 grid gap-3">
            {peer.peers.map((answer) => {
              const mine = answer.reviews.find((r) => r.mine);
              return (
                <li key={answer.id} className="rounded-lg border border-line bg-paper px-4 py-3">
                  <p className="text-sm font-semibold">{answer.authorName}</p>
                  <AnswerBody text={answer.responseText} url={answer.responseUrl} />
                  <ReviewList reviews={answer.reviews} />
                  <PeerReviewForm
                    responseId={answer.id}
                    lessonPath={lessonPath}
                    authorName={answer.authorName}
                    existingComment={mine?.comment}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PracticeSection({
  lessonId,
  lessonPath,
  practice,
  practiceAnswer,
  myPractice,
  peer,
}: {
  lessonId: string;
  lessonPath: string;
  practice: string;
  practiceAnswer: string | null;
  myPractice: PracticeResponse | null;
  peer: PeerPractice;
}) {
  return (
    <section aria-labelledby="practice-heading" className="mt-8 border-t border-line pt-6">
      <h2 id="practice-heading" className="font-display text-2xl font-bold">
        Practice
      </h2>
      <div className="mt-3">
        <MarkdownContent content={practice} />
      </div>

      {practiceAnswer && (
        <details className="group mt-5 rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer list-none px-5 py-3 font-semibold marker:hidden">
            <span className="group-open:hidden">Show the example answer</span>
            <span className="hidden group-open:inline">Hide the example answer</span>
            <span className="ml-2 text-sm font-normal text-muted">Try the task yourself first.</span>
          </summary>
          <div className="border-t border-line px-5 py-4">
            <MarkdownContent content={practiceAnswer} />
          </div>
        </details>
      )}

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-lg font-bold">Peer review</h3>
        <p className="mt-1 mb-4 text-sm text-muted">
          Optional. Save your answer, then give feedback on answers other learners have shared.
        </p>
        <PracticeForm lessonId={lessonId} lessonPath={lessonPath} existing={myPractice} />
        <div className="mt-6 border-t border-line pt-5">
          <PeerPanel peer={peer} lessonPath={lessonPath} />
        </div>
      </div>
    </section>
  );
}
