export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
