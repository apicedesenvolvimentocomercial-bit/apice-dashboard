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
