import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-emerald-50 to-zinc-100 p-4 dark:from-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-md">{children}</div>
      <Link
        href="/privacidade"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Política de Privacidade
      </Link>
    </div>
  )
}
