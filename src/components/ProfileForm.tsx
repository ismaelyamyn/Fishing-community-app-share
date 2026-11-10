"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateProfile } from "@/app/account/actions";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};

const inputClass =
  "w-full rounded border border-ocean-500/40 bg-white px-3 py-2 text-ocean-900 outline-none focus:border-ocean-700";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-ocean-700 px-4 py-2 font-medium text-white hover:bg-ocean-900 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export default function ProfileForm({
  displayName,
  islandId,
  islands,
}: {
  displayName: string;
  islandId: number | null;
  islands: { id: number; name: string }[];
}) {
  const [state, formAction] = useFormState(updateProfile, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Display name
        <input
          name="display_name"
          type="text"
          required
          minLength={2}
          maxLength={40}
          defaultValue={displayName}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Home island
        <select name="island_id" defaultValue={islandId ?? ""} className={inputClass}>
          <option value="">Not set</option>
          {islands.map((island) => (
            <option key={island.id} value={island.id}>
              {island.name}
            </option>
          ))}
        </select>
      </label>

      {state.error && (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">
          {state.message}
        </p>
      )}

      <div>
        <SaveButton />
      </div>
    </form>
  );
}
