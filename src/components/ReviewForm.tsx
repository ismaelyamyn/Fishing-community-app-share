"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitReview } from "@/app/spots/[id]/reviewActions";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-ocean-700 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-900 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Post review"}
    </button>
  );
}

export default function ReviewForm({ spotId }: { spotId: string }) {
  const [state, formAction] = useFormState(submitReview, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-ocean-500/30 bg-white p-4">
      <input type="hidden" name="spot_id" value={spotId} />
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1 font-medium">Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex items-center gap-1">
            <input type="radio" name="rating" value={n} required /> {n} ★
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Comment (optional)
        <textarea
          name="comment"
          rows={3}
          maxLength={1000}
          className="w-full rounded border border-ocean-500/40 bg-white px-3 py-2 font-normal outline-none focus:border-ocean-700"
        />
      </label>
      <p className="text-xs text-ocean-700">
        A review tied to one of your own recent trips here counts fully; without a trip it counts half.
      </p>
      {state.error && (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.message && <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">{state.message}</p>}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
