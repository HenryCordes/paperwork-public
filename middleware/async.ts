// Handling the try/catch in a middleware function by wrapping it with a promise.
import { Request, Response, NextFunction, RequestHandler } from 'express'

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown

const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }

export = asyncHandler
