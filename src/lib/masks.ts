/**
 * Máscaras e regexes de input compartilhados entre cliente e servidor.
 *
 * O valor MASCARADO é o valor canônico: o que a máscara do frontend produz é
 * exatamente o que o zod da action aceita e o que vai para o banco. Não há
 * normalização no meio — se mudar um formato aqui, o outro lado acompanha
 * sozinho porque ambos importam deste arquivo.
 */

/** Telefone celular BR mascarado: `(11) 91234-1234` (DDB sem zero à esquerda, 9 obrigatório). */
export const PHONE_BR_REGEX = /^\([1-9]{2}\) 9\d{4}-\d{4}$/

/** E-mail — mesmo teste "frouxo" usado nas actions, antes do `.email()` do zod. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** CPF mascarado: `123.456.789-01` — mesmo formato exigido por `isValidCpf` (`lib/cpf`). */
export const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/

/**
 * Texto livre seguro (nome, notas, procedimentos de interesse) — mesma lista de
 * caracteres aceita pelas actions do servidor.
 */
export const SAFE_TEXT_REGEX =
  /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/

/** Maior valor monetário aceito pelas actions (`estimatedValue`, receitas, custos). */
export const MAX_MONEY = 9_999_999_999.99

const MONEY_MAX_INT_DIGITS = 10 // casa com MAX_MONEY

/**
 * Aplica a máscara de telefone progressivamente (aceita entrada parcial):
 * `1` → `(1` · `119` → `(11) 9` · `11912341234` → `(11) 91234-1234`.
 * Dígitos além do 11º são descartados.
 */
export function formatPhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Aplica a máscara de CPF progressivamente (aceita entrada parcial):
 * `1` → `1` · `1234` → `123.4` · `12345678901` → `123.456.789-01`.
 * Só dígitos entram; além do 11º são descartados.
 */
export function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/**
 * Mantém apenas o que é dinheiro em pt-BR: dígitos e UMA vírgula, com no máximo
 * 2 casas de centavos e 10 dígitos na parte inteira. Preserva a ordem do que foi
 * digitado (não força o cursor para o fim).
 */
export function sanitizeMoneyBR(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '')
  const firstComma = cleaned.indexOf(',')
  if (firstComma === -1) return cleaned.slice(0, MONEY_MAX_INT_DIGITS)

  const int = cleaned.slice(0, firstComma).slice(0, MONEY_MAX_INT_DIGITS)
  const cents = cleaned
    .slice(firstComma + 1)
    .replace(/,/g, '')
    .slice(0, 2)
  return `${int},${cents}`
}

/** `"1234,5"` → `1234.5`. Vazio/incompleto (`""`, `","`) → `undefined`. */
export function parseMoneyBR(display: string): number | undefined {
  const normalized = sanitizeMoneyBR(display).replace(',', '.')
  if (normalized === '' || normalized === '.') return undefined
  const n = Number(normalized)
  return Number.isFinite(n) ? n : undefined
}

/** `1234.5` → `"1234,50"`. */
export function formatMoneyBR(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/**
 * Só dígitos — campos que o zod exige `.int()` (duração em minutos, recorrência
 * em dias). Zero à esquerda cai (`"007"` → `"7"`), então o que está no campo é
 * exatamente o número que a action recebe.
 *
 * `maxDigits` deve vir do TETO do campo no zod (360 minutos / 365 dias = 3
 * dígitos): assim o usuário não digita uma ordem de grandeza inteira só para ser
 * recusado no submit.
 */
export function sanitizeInteger(raw: string, maxDigits = 9): string {
  return raw
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, maxDigits)
}
