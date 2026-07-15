export function isValidCpf(cpf: string): boolean {
  if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf)) return false

  const digits = cpf.replace(/\D/g, '')
  if (/^(\d)\1{10}$/.test(digits)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(digits[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(digits[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(digits[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(digits[10])) return false

  return true
}
