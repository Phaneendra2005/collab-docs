export abstract class AppError extends Error {
  public readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation Error') {
    super(message, 400)
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication Error') {
    super(message, 401)
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Authorization Error') {
    super(message, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found') {
    super(message, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource Conflict') {
    super(message, 409)
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests') {
    super(message, 429)
  }
}
