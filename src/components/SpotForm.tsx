"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveSpot } from "@/app/spots/actions";
import type { FormState } from "@/lib/form-state";
import type { Island, Species } from "@/lib/types";
import LocationPicker, { type Coords } from "@/components/LocationPicker";

const initialState: FormState = {};

const inputClass =
  "w-full rounded border border-ocean-500/40 bg-white px-3 py-2 text-ocean-900 outline-none focus:border-ocean-700";

export type SpotFormInitial = {
  id?: string;
  name: string;
  description: string;
  depthM: number | null;
  islandId: number | null;
  speciesIds: number[];
  coords: Coords | null;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-ocean-700 px-4 py-2 font-medium text-white hover:bg-ocean-900 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export default function SpotForm({
  initial,
  islands,
  species,
}: {
  initial: SpotFormInitial;
  islands: Island[];
  species: Species[];
}) {
  const [state, formAction] = useFormState(saveSpot, initialState);
  const [coords, setCoords] = useState<Coords | null>(initial.coords);
  const isEdit = Boolean(initial.id);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {initial.id && <input type="hidden" name="spot_id" value={initial.id} />}
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Spot name
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          defaultValue={initial.name}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Description (optional)
        <textarea
          name="description"
          rows={4}
          maxLength={1000}
          defaultValue={initial.description}
          placeholder="Reef edge, current direction, best bait, landmarks…"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nearest island
          <select name="island_id" defaultValue={initial.islandId ?? ""} className={inputClass}>
            <option value="">Not set</option>
            {islands.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Depth in metres (optional)
          <input
            name="depth_m"
            type="number"
            min={0}
            max={2000}
            step="0.1"
            defaultValue={initial.depthM ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Fish found here</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {species.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="species_ids"
                value={s.id}
                defaultChecked={initial.speciesIds.includes(s.id)}
              />
              {s.name_en}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Location</span>
        <p className="text-sm text-ocean-700">
          Click the map to place the spot.{" "}
          {coords ? (
            <span className="font-medium">
              Selected: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          ) : (
            <span>Nothing selected yet.</span>
          )}
        </p>
        <LocationPicker initial={initial.coords} onChange={setCoords} />
      </div>

      {state.error && (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div>
        <SubmitButton label={isEdit ? "Save changes" : "Add spot"} />
      </div>
    </form>
  );
}
