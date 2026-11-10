"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type PhotoItem = { id: string; url: string; path: string; userId: string };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export default function PhotoSection({
  spotId,
  photos,
  userId,
  isAdmin,
}: {
  spotId: string;
  photos: PhotoItem[];
  userId: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!userId || files.length === 0) return;

    setBusy(true);
    setError(null);
    const supabase = createClient();

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name}: only JPEG, PNG or WebP photos are allowed.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name}: photos must be 5 MB or smaller.`);
        continue;
      }

      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${spotId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("spot-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError(uploadError.message);
        continue;
      }

      const { error: dbError } = await supabase
        .from("spot_photos")
        .insert({ spot_id: spotId, user_id: userId, storage_path: path });
      if (dbError) {
        // do not leave an unlisted file behind
        await supabase.storage.from("spot-photos").remove([path]);
        setError(dbError.message);
      }
    }

    setBusy(false);
    router.refresh();
  }

  async function removePhoto(photo: PhotoItem) {
    if (!window.confirm("Delete this photo?")) return;
    setError(null);
    const supabase = createClient();

    const { error: dbError } = await supabase.from("spot_photos").delete().eq("id", photo.id);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    await supabase.storage.from("spot-photos").remove([photo.path]);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Photos</h2>

      {photos.length === 0 ? (
        <p className="text-sm">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="relative overflow-hidden rounded border border-ocean-500/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="Fishing spot"
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              {userId && (photo.userId === userId || isAdmin) && (
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {userId ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Add photos (JPEG, PNG or WebP, up to 5 MB each)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={onFiles}
            className="text-sm"
          />
        </label>
      ) : (
        <p className="text-sm">Log in to add photos.</p>
      )}

      {busy && <p className="text-sm">Uploading…</p>}
      {error && (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
