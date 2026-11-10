import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/ProfileForm";

export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [{ data: profile }, { data: islands }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, role, island_id, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("islands").select("id, name").order("name"),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Link href="/" className="text-sm text-ocean-700 underline">
        ← Back to the map
      </Link>
      <h1 className="text-2xl font-semibold">Your account</h1>

      {profile ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-medium">Email</dt>
            <dd>{user.email}</dd>
            <dt className="font-medium">Role</dt>
            <dd className="capitalize">{profile.role}</dd>
            <dt className="font-medium">Member since</dt>
            <dd>{new Date(profile.created_at).toLocaleDateString("en-GB")}</dd>
          </dl>
          <ProfileForm
            displayName={profile.display_name}
            islandId={profile.island_id}
            islands={islands ?? []}
          />
        </>
      ) : (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          No profile found for this account. Run phase2.sql in the Supabase SQL Editor
          (it creates the signup trigger and backfills existing users), then reload.
        </p>
      )}
    </main>
  );
}
