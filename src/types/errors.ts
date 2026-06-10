export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public fields?: Record<string, string[]>
  ) {
    super('VALIDATION_ERROR', message, 400)
    this.name = 'ValidationError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super('UNAUTHORIZED', message, 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super('FORBIDDEN', message, 403)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Recurso') {
    super('NOT_FOUND', `${entity} não encontrado`, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
    this.name = 'ConflictError'
  }
}

export type ErrorPayload = { code: string; message: string; fields?: Record<string, string[]> }

/**
 * Converte um erro de validação do zod em `Result` de falha COM o mapa de
 * campos (Fase 4 do plano de correções). Antes as actions devolviam só a 1ª
 * issue como string (`code: 'ERROR'`): a UI não conseguia marcar campo a campo
 * nem distinguir validação de erro genérico. `fields` segue o shape do
 * `flatten().fieldErrors` do zod ({ campo: [mensagens] }).
 */
export function validationFail(error: {
  issues: { message: string }[]
  flatten: () => { fieldErrors: Record<string, string[] | undefined> }
}): { success: false; error: ErrorPayload } {
  const first = error.issues[0]?.message
  return fail(
    new ValidationError(
      first ? `Dados inválidos: ${first}` : 'Dados inválidos',
      error.flatten().fieldErrors as Record<string, string[]>
    )
  )
}

export type Result<T> = { success: true; data: T } | { success: false; error: ErrorPayload }

export function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

export function fail(error: AppError | string): { success: false; error: ErrorPayload } {
  if (typeof error === 'string') {
    return { success: false, error: { code: 'ERROR', message: error } }
  }
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      fields: error instanceof ValidationError ? error.fields : undefined,
    },
  }
}

/**
 * Empacota o corpo de uma Server Action em try/catch, convertendo qualquer
 * `AppError` lançado (Forbidden/NotFound/Validation/Unauthorized/Conflict)
 * para `Result<T>` sem mascarar erros inesperados. Mantém o contrato
 * Result<T> consistente em todas as actions e elimina o estreitamento de
 * tipo quando uma action só tem caminho de sucesso aparente.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err)
    }
    // Erros inesperados re-lançam — Sentry captura, UI cai no error boundary.
    throw err
  }
}
