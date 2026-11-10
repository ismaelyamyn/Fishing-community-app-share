"use client";

import { deleteSpot } from "@/app/spots/actions";

export default function DeleteSpotButton({ spotId }: { spotId: string }) {
  return (
    <form
      action={deleteSpot}
      onSubmit={(e) => {
        if (!window.confirm("Delete this spot and its photos? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="spot_id" value={spotId} />
      <button
        type="submit"
        className="rounded border border-red-600 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
