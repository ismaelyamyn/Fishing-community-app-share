import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Link href="/" className="text-sm text-ocean-700 underline">
        ← Back to the map
      </Link>
      <h1 className="text-2xl font-semibold">Log in</h1>
      {searchParams.error === "confirm" && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          That confirmation link is invalid or has expired. Try signing up again.
        </p>
      )}
      <AuthForm mode="login" next={searchParams.next ?? "/"} />
    </main>
  );
}
