"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signIn, signUp } from "@/app/auth/actions";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};

const inputClass =
  "w-full rounded border border-ocean-500/40 bg-white px-3 py-2 text-ocean-900 outline-none focus:border-ocean-700";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-ocean-700 px-4 py-2 font-medium text-white hover:bg-ocean-900 disabled:opacity-60"
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

export default function AuthForm({
  mode,
  next = "/",
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const [state, formAction] = useFormState(
    mode === "login" ? signIn : signUp,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "signup" && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Display name
          <input
            name="display_name"
            type="text"
            required
            minLength={2}
            maxLength={40}
            autoComplete="nickname"
            className={inputClass}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputClass}
        />
      </label>

      {mode === "login" && <input type="hidden" name="next" value={next} />}

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

      <SubmitButton label={mode === "login" ? "Log in" : "Create account"} />

      <p className="text-center text-sm">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-ocean-700 underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="font-medium text-ocean-700 underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
