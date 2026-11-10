import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Link href="/" className="text-sm text-ocean-700 underline">
        ← Back to the map
      </Link>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <AuthForm mode="signup" />
    </main>
  );
}
