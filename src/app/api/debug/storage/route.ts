import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { CLIENT_DOCUMENTS_BUCKET, getSupabaseAdmin } from '@/lib/supabase'
import { getTenantContext } from '@/server/tenant/context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Diagnóstico TEMPORÁRIO do armazenamento de documentos (Supabase Storage). Só
 * reporta PRESENÇA das envs (booleano — NUNCA o valor) + se o bucket existe de fato.
 * Exige login. Remover depois de resolver o setup.
 *
 * Uso: logado no app, abra /api/debug/storage no navegador.
 */
export async function GET() {
  try {
    await getTenantContext() // exige sessão; lança Unauthorized se não logado
  } catch {
    return NextResponse.json({ error: 'Faça login primeiro.' }, { status: 401 })
  }

  const urlPresent = !!env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKeyPresent = !!env.SUPABASE_SERVICE_ROLE_KEY
  const anonKeyPresent = !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = getSupabaseAdmin()

  // Checa o bucket de verdade (confirma nome + permissão da chave). Erro do Supabase
  // é seguro de expor (ex.: "Bucket not found", erro de auth = chave errada).
  let bucket: { exists: boolean; error: string | null } = { exists: false, error: null }
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.getBucket(CLIENT_DOCUMENTS_BUCKET)
      bucket = { exists: !!data && !error, error: error?.message ?? null }
    } catch (e) {
      bucket = { exists: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({
    // Presença das variáveis (booleano, sem valor).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: urlPresent,
      SUPABASE_SERVICE_ROLE_KEY: serviceKeyPresent,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKeyPresent,
    },
    // true só quando URL + service role estão ambas presentes (= upload tenta).
    clientInitialized: !!supabase,
    bucketName: CLIENT_DOCUMENTS_BUCKET,
    bucket,
    nodeEnv: env.NODE_ENV,
  })
}
