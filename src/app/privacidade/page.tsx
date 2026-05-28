import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Política de Privacidade e uso de cookies do Senno, conforme a LGPD.',
}

const UPDATED_AT = '22 de maio de 2026'

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 leading-relaxed text-foreground">
      <h1 className="text-3xl font-bold">Política de Privacidade</h1>
      <p className="mt-1 text-sm text-muted-foreground">Última atualização: {UPDATED_AT}</p>

      <p className="mt-6">
        Esta Política descreve como o <strong>Senno</strong> trata dados pessoais, em conformidade
        com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados — LGPD).
      </p>

      <h2 className="mt-8 text-xl font-semibold">1. Controlador dos dados</h2>
      <p className="mt-2">
        {/* TODO(usuário): preencher razão social, CNPJ e contato do Encarregado/DPO. */}O
        controlador é a empresa operadora do Senno. Para exercer seus direitos ou tirar dúvidas
        sobre privacidade, contate o Encarregado de Dados (DPO) pelo e-mail informado no rodapé do
        contrato de serviço.
      </p>

      <h2 className="mt-8 text-xl font-semibold">2. Dados que tratamos</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          <strong>Dados de conta:</strong> nome, e-mail e credenciais de acesso de usuários da
          agência e das clínicas.
        </li>
        <li>
          <strong>Dados operacionais da clínica:</strong> pacientes, agendamentos, procedimentos,
          metas e indicadores — tratados sob responsabilidade da própria clínica contratante.
        </li>
        <li>
          <strong>Dados de uso:</strong> registros técnicos (logs) necessários para segurança e
          funcionamento, sem finalidade de rastreamento publicitário.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">3. Finalidade e base legal</h2>
      <p className="mt-2">
        Tratamos dados para executar o contrato de prestação de serviço (art. 7º, V da LGPD),
        cumprir obrigações legais e garantir a segurança da informação (legítimo interesse), com
        isolamento entre clínicas — cada clínica acessa apenas os próprios dados.
      </p>

      <h2 className="mt-8 text-xl font-semibold">4. Cookies</h2>
      <p className="mt-2">
        Utilizamos apenas <strong>cookies essenciais</strong>, indispensáveis para autenticação e
        manutenção da sessão do usuário. Não usamos cookies de publicidade, rastreamento de
        terceiros ou perfilamento. Por serem estritamente necessários ao funcionamento, esses
        cookies não dependem de consentimento prévio, mas informamos seu uso de forma transparente
        por meio do aviso exibido no primeiro acesso.
      </p>

      <h2 className="mt-8 text-xl font-semibold">5. Compartilhamento</h2>
      <p className="mt-2">
        Os dados são processados em provedores de infraestrutura e e-mail estritamente para operar o
        serviço (hospedagem, banco de dados e envio transacional). Não vendemos nem cedemos dados
        pessoais para finalidades de marketing de terceiros.
      </p>

      <h2 className="mt-8 text-xl font-semibold">6. Retenção</h2>
      <p className="mt-2">
        Mantemos os dados pelo período da relação contratual e pelos prazos legais aplicáveis.
        Registros com valor de negócio usam exclusão lógica; a eliminação definitiva ocorre conforme
        a política de retenção acordada com o contratante.
      </p>

      <h2 className="mt-8 text-xl font-semibold">7. Seus direitos (art. 18 da LGPD)</h2>
      <p className="mt-2">
        Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade
        e eliminação de dados, bem como informação sobre compartilhamento. As solicitações são
        atendidas pelo Encarregado de Dados.
      </p>

      <h2 className="mt-8 text-xl font-semibold">8. Segurança</h2>
      <p className="mt-2">
        Adotamos controle de acesso por papel e por clínica, criptografia de senhas e isolamento de
        dados entre tenants. Mesmo assim, nenhum sistema é absolutamente seguro; incidentes
        relevantes são comunicados conforme a LGPD.
      </p>

      <p className="mt-10">
        <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
          ← Voltar ao início
        </Link>
      </p>
    </main>
  )
}
