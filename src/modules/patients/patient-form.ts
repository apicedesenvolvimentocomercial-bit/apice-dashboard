import { isValidCpf } from '@/lib/cpf'
import { EMAIL_REGEX, PHONE_BR_REGEX } from '@/lib/masks'

/**
 * Validação compartilhada entre o cadastro (`create-patient-dialog`) e a edição
 * (`edit-patient-dialog`) de paciente. Espelha `createPatientSchema` das actions
 * (os mesmos 5 campos obrigatórios + máscaras) — o servidor continua sendo a
 * autoridade; isto é só o feedback local imediato.
 */
export type PatientFormValues = {
  name: string
  phone: string
  email: string
  birthDate: string
  cpf: string
  notes: string
}

export type PatientFormField = 'name' | 'phone' | 'email' | 'birthDate' | 'cpf'
export type PatientFormErrors = Partial<Record<PatientFormField, string>>

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  name: '',
  phone: '',
  email: '',
  birthDate: '',
  cpf: '',
  notes: '',
}

export function validatePatientForm(form: PatientFormValues): PatientFormErrors {
  const errors: PatientFormErrors = {}

  // feat1 — os 5 campos são obrigatórios no cadastro/edição manual.
  if (!form.name.trim()) {
    errors.name = 'Nome obrigatório'
  } else if (form.name.trim().length < 2) {
    errors.name = 'Mínimo 2 caracteres'
  } else if (form.name.length > 255) {
    errors.name = 'Nome muito grande'
  }

  if (!form.phone.trim()) {
    errors.phone = 'Telefone obrigatório'
  } else if (!PHONE_BR_REGEX.test(form.phone.trim())) {
    errors.phone = 'Telefone incompleto'
  }

  if (!form.email.trim()) {
    errors.email = 'E-mail obrigatório'
  } else if (form.email.length > 255) {
    errors.email = 'E-mail muito grande'
  } else if (!EMAIL_REGEX.test(form.email.trim())) {
    errors.email = 'E-mail inválido'
  }

  if (!form.birthDate) {
    errors.birthDate = 'Data obrigatória'
  } else {
    const date = new Date(form.birthDate)
    if (isNaN(date.getTime())) {
      errors.birthDate = 'Data inválida'
    } else if (date > new Date()) {
      errors.birthDate = 'Data no futuro'
    } else if (date.getFullYear() < 1900) {
      errors.birthDate = 'Data muito antiga'
    }
  }

  if (!form.cpf.trim()) {
    errors.cpf = 'CPF obrigatório'
  } else if (form.cpf.replace(/\D/g, '').length !== 11) {
    errors.cpf = 'CPF incompleto'
  } else if (!isValidCpf(form.cpf)) {
    errors.cpf = 'CPF inválido'
  }

  return errors
}
