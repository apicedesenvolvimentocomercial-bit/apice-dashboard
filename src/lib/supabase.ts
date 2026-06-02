import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

/**
 * Bucket PRIVADO dos documentos do card do cliente (item 6c). Crie-o no painel do
 * Supabase como "Private". O acesso ao arquivo é sempre por URL assinada de curta
 * duração — nunca público.
 */
export const CLIENT_DOCUMENTS_BUCKET = 'client-documents'

let cached: SupabaseClient | null | undefined

/**
 * Client admin do Supabase (service role) — SERVER ONLY. Retorna `null` se as
 * envs não estão configuradas (ex.: banco de teste Neon sem Supabase), para o
 * recurso de documentos DEGRADAR graciosamente em vez de quebrar. Nunca exponha
 * a service role ao browser.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    cached = null
    return null
  }
  // Normaliza p/ a ORIGEM (sem path nem trailing slash). O supabase-js monta a URL
  // de storage com `new URL('storage/v1', url)` — então QUALQUER path em
  // NEXT_PUBLIC_SUPABASE_URL (ex.: ".../storage/v1") vira prefixo e a request sai
  // como ".../storage/v1/storage/v1/object/…", que o storage rejeita com
  // "Invalid path specified in request URL". Origin-only blinda contra esse erro.
  let origin = url
  try {
    origin = new URL(url).origin
  } catch {
    /* env já validado como URL; fallback defensivo */
  }
  cached = createClient(origin, key, { auth: { persistSession: false } })
  return cached
}

export function isDocumentStorageConfigured(): boolean {
  return getSupabaseAdmin() !== null
}
