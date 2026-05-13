'use client'

// Wrapper isolando o SDK de auth do código de UI. Trocar de provider
// (NextAuth GA, Lucia, Better-Auth) no futuro se resume a editar este arquivo
// — components nunca importam direto de `next-auth/react`.
export { signIn, signOut, useSession } from 'next-auth/react'
