import { describe, expect, it } from 'vitest'

import { isValidCpf } from './cpf'
import {
  CPF_REGEX,
  MAX_MONEY,
  PHONE_BR_REGEX,
  formatCpf,
  formatMoneyBR,
  formatPhoneBR,
  parseMoneyBR,
  sanitizeInteger,
  sanitizeMoneyBR,
} from './masks'

describe('formatPhoneBR', () => {
  it('mascara progressivamente enquanto o usuário digita', () => {
    expect(formatPhoneBR('')).toBe('')
    expect(formatPhoneBR('1')).toBe('(1')
    expect(formatPhoneBR('11')).toBe('(11')
    expect(formatPhoneBR('119')).toBe('(11) 9')
    expect(formatPhoneBR('1191234')).toBe('(11) 91234')
    expect(formatPhoneBR('11912341')).toBe('(11) 91234-1')
    expect(formatPhoneBR('11912341234')).toBe('(11) 91234-1234')
  })

  it('descarta lixo e dígitos além do 11º (colar texto sujo converge p/ a máscara)', () => {
    expect(formatPhoneBR('+55 (11) 91234-1234')).toBe('(55) 11912-3412')
    expect(formatPhoneBR('11912341234999')).toBe('(11) 91234-1234')
    expect(formatPhoneBR('abc')).toBe('')
  })

  it('a saída completa satisfaz o regex que o zod da action exige', () => {
    expect(PHONE_BR_REGEX.test(formatPhoneBR('11912341234'))).toBe(true)
    // Incompleto NÃO passa — o servidor rejeita o que a máscara ainda não fechou.
    expect(PHONE_BR_REGEX.test(formatPhoneBR('119123'))).toBe(false)
  })

  it('rejeita DDD com zero à esquerda e celular sem o 9', () => {
    expect(PHONE_BR_REGEX.test('(01) 91234-1234')).toBe(false)
    expect(PHONE_BR_REGEX.test('(11) 81234-1234')).toBe(false)
    expect(PHONE_BR_REGEX.test('11 912341234')).toBe(false) // formato antigo
  })
})

describe('formatCpf', () => {
  it('mascara progressivamente enquanto o usuário digita', () => {
    expect(formatCpf('')).toBe('')
    expect(formatCpf('1')).toBe('1')
    expect(formatCpf('123')).toBe('123')
    expect(formatCpf('1234')).toBe('123.4')
    expect(formatCpf('1234567')).toBe('123.456.7')
    expect(formatCpf('1234567890')).toBe('123.456.789-0')
    expect(formatCpf('12345678901')).toBe('123.456.789-01')
  })

  it('descarta lixo e dígitos além do 11º (colar texto sujo converge p/ a máscara)', () => {
    expect(formatCpf('123.456.789/01')).toBe('123.456.789-01')
    expect(formatCpf('12345678901999')).toBe('123.456.789-01')
    expect(formatCpf('abc')).toBe('')
  })

  it('a saída completa satisfaz o regex de formato exigido por isValidCpf', () => {
    const masked = formatCpf('11144477735') // CPF válido (dígitos verificadores corretos)
    expect(CPF_REGEX.test(masked)).toBe(true)
    expect(isValidCpf(masked)).toBe(true)
    // Incompleto NÃO passa no formato.
    expect(CPF_REGEX.test(formatCpf('123456'))).toBe(false)
  })
})

describe('sanitizeMoneyBR', () => {
  it('mantém apenas dígitos e uma vírgula', () => {
    expect(sanitizeMoneyBR('1234')).toBe('1234')
    expect(sanitizeMoneyBR('1234,56')).toBe('1234,56')
    expect(sanitizeMoneyBR('R$ 1.234,56')).toBe('1234,56')
    expect(sanitizeMoneyBR('12a3b4')).toBe('1234')
    expect(sanitizeMoneyBR('-12')).toBe('12')
    expect(sanitizeMoneyBR('1e5')).toBe('15')
  })

  it('só a primeira vírgula vale', () => {
    expect(sanitizeMoneyBR('12,34,56')).toBe('12,34')
    expect(sanitizeMoneyBR('12,3,4')).toBe('12,34')
    expect(sanitizeMoneyBR(',5')).toBe(',5')
  })

  it('corta centavos além de 2 casas', () => {
    expect(sanitizeMoneyBR('10,999')).toBe('10,99')
    expect(sanitizeMoneyBR('10,5')).toBe('10,5')
  })

  it('limita a parte inteira ao teto da action', () => {
    expect(sanitizeMoneyBR('123456789012345')).toBe('1234567890')
    expect(parseMoneyBR(sanitizeMoneyBR('9999999999,99'))).toBeLessThanOrEqual(MAX_MONEY)
  })
})

describe('sanitizeInteger', () => {
  it('mantém apenas dígitos (nada de decimal, sinal ou notação científica)', () => {
    expect(sanitizeInteger('60')).toBe('60')
    expect(sanitizeInteger('')).toBe('')
    expect(sanitizeInteger('1,5')).toBe('15')
    expect(sanitizeInteger('1.5')).toBe('15')
    expect(sanitizeInteger('-30')).toBe('30')
    expect(sanitizeInteger('1e5')).toBe('15')
    expect(sanitizeInteger('abc')).toBe('')
  })

  it('derruba zero à esquerda, mas o zero sozinho fica (para o erro cobrá-lo)', () => {
    expect(sanitizeInteger('007')).toBe('7')
    expect(sanitizeInteger('0')).toBe('0')
    expect(sanitizeInteger('00')).toBe('0')
  })

  it('limita a quantidade de dígitos ao teto do campo', () => {
    expect(sanitizeInteger('1234', 3)).toBe('123')
    expect(sanitizeInteger('0360', 3)).toBe('360')
    expect(Number(sanitizeInteger('999', 3))).toBeGreaterThan(365) // fora da faixa = erro inline
  })
})

describe('parseMoneyBR / formatMoneyBR', () => {
  it('converte pt-BR → número', () => {
    expect(parseMoneyBR('1234,56')).toBe(1234.56)
    expect(parseMoneyBR('1234')).toBe(1234)
    expect(parseMoneyBR('10,5')).toBe(10.5)
  })

  it('vazio/incompleto vira undefined (campo opcional na action)', () => {
    expect(parseMoneyBR('')).toBeUndefined()
    expect(parseMoneyBR(',')).toBeUndefined()
    expect(parseMoneyBR('abc')).toBeUndefined()
  })

  it('formata número → pt-BR (autofill da soma dos procedimentos)', () => {
    expect(formatMoneyBR(1200)).toBe('1200,00')
    expect(formatMoneyBR(1234.5)).toBe('1234,50')
  })

  it('ida e volta preserva o valor', () => {
    expect(parseMoneyBR(formatMoneyBR(1234.56))).toBe(1234.56)
  })
})
