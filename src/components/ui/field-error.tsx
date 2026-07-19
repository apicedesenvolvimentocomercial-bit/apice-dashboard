import { cn } from '@/lib/utils'

/**
 * Mensagem de validação de UM campo — sempre UMA linha.
 *
 * A regra existe por causa do layout: erro de campo mora debaixo do input, e
 * campos vivem em grids de 2 colunas dentro de diálogos estreitos. Um erro de
 * duas linhas empurra o formulário inteiro (efeito sanfona) e, quando quebra,
 * invade visualmente o espaço do campo vizinho.
 *
 * Duas garantias, uma de cada lado:
 * - `truncate` — a linha NUNCA quebra nem excede a largura do input, seja qual
 *   for a mensagem (o `title` devolve o texto completo no hover);
 * - texto curto — as mensagens são escritas para caber (~24 caracteres). O
 *   truncate é a rede de segurança, não o plano A.
 *
 * `FIELD_ERROR_SLOT` reserva a altura de uma linha quando NÃO há erro, para o
 * diálogo ter altura constante. É opt-in: só faz sentido onde o pulo incomoda.
 */
/**
 * O espaço ACIMA da mensagem é o do container do campo (`space-y-2`, 8px) — a
 * mensagem fica solta do input, de propósito. O `-mb-1` corta 4px do espaço
 * ABAIXO, aproximando o próximo campo sem colar o erro no input.
 *
 * `leading-4` é o mínimo seguro — `truncate` corta o overflow, então uma
 * entrelinha igual ao tamanho da fonte (12px) decepava a perna do "ç"/"g".
 */
export const FIELD_ERROR_TEXT =
  '-mb-1 block truncate text-xs font-medium leading-4 text-destructive'

/** Altura exata de uma linha de `FIELD_ERROR_TEXT` — os dois DEVEM bater. */
export const FIELD_ERROR_SLOT = '-mb-1 h-4'

type Props = {
  message?: string | null
  /** Ocupa a linha mesmo sem mensagem — evita o formulário pular. */
  reserve?: boolean
  className?: string
}

/** Erro inline para formulários que NÃO usam react-hook-form (o resto usa `FormMessage`). */
export function FieldError({ message, reserve = false, className }: Props) {
  if (!message) {
    return reserve ? <p className={cn(FIELD_ERROR_SLOT, className)} aria-hidden="true" /> : null
  }

  return (
    <p className={cn(FIELD_ERROR_TEXT, className)} title={message}>
      {message}
    </p>
  )
}
