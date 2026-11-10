"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createTrip } from "@/app/trips/actions";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};
const inputClass =
  "w-full rounded border border-ocean-500/40 bg-white px-3 py-2 text-ocean-900 outline-none focus:border-ocean-700";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-ocean-700 px-4 py-2 font-medium text-white hover:bg-ocean-900 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Log trip"}
    </button>
  );
}

export default function TripForm({
  spots,
  species,
  defaultSpotId,
  nowLocal,
}: {
  spots: { id: string; name: string; island_name: string | null }[];
  species: { id: number; name_en: string }[];
  defaultSpotId: string;
  nowLocal: string; // yyyy-MM-ddTHH:mm in Maldives time
}) {
  const [state, formAction] = useFormState(createTrip, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Fishing spot
        <select name="spot_id" required defaultValue={defaultSpotId} className={inputClass}>
          <option value="" disabled>
            Choose a spot…
          </option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.island_name ? ` (${s.island_name})` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Started (Maldives time)
          <input type="datetime-local" name="started_at" required defaultValue={nowLocal} max={nowLocal} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Ended (optional)
          <input type="datetime-local" name="ended_at" max={nowLocal} className={inputClass} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Was it a good catch?</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="good_catch" value="yes" required /> Yes, a good catch
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="good_catch" value="no" required /> No, a poor trip
        </label>
        <p className="text-xs text-ocean-700">
          Honest answers, including poor trips, are what make the predictions work.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What did you catch? (optional, up to 3 kinds)</legend>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_6rem] gap-2">
            <select name={`species_${i}`} defaultValue="" className={inputClass} aria-label={`Species ${i + 1}`}>
              <option value="">—</option>
              {species.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_en}
                </option>
              ))}
            </select>
            <input name={`quantity_${i}`} type="number" min={0} max={10000} step={1} placeholder="Qty" className={inputClass} aria-label={`Quantity ${i + 1}`} />
            <input name={`weight_${i}`} type="number" min={0} step="0.1" placeholder="kg" className={inputClass} aria-label={`Weight ${i + 1}`} />
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes (optional)
        <textarea name="notes" rows={3} maxLength={500} className={inputClass} />
      </label>

      <p className="text-xs text-ocean-700">
        Your trips are private. Only totals and patterns feed the predictions; nobody can see your individual trips.
      </p>

      {state.error && (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
