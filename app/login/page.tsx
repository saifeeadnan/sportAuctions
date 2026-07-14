import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold mb-6">Log in</h1>
      {error && (
        <p className="mb-4 text-sm text-red-600">
          Invalid email or password.
        </p>
      )}
      <form action={loginAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
