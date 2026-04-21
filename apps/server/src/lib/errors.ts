import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: FastifyError | AppError | ZodError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof AppError) {
    req.log.warn({ code: err.code, msg: err.message }, 'app error');
    reply.status(err.status).send({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    reply.status(400).send({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  const fastifyErr = err as FastifyError;
  if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
    reply.status(fastifyErr.statusCode).send({ error: err.message, code: fastifyErr.code });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  reply.status(500).send({ error: 'Internal server error', code: 'INTERNAL' });
}
