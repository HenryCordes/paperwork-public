import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

import User from '../models/User'

import asyncHandlers from './async'

// Middleware to protect the route by validating the user token
// from the Authorization header
export const protect = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    let token: string | undefined
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (!token) {
      return res.status(401).json({ success: false, data: 'Not Authorized' })
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as jwt.JwtPayload
      req.user = await User.findById(decoded.id)
      const user = req.user
      // Store the organization ID on the request object for use by the
      // subscription middleware instead of the CLS namespace (may be absent).
      if (user && user.organization) {
        req.organizationId = user.organization.toString()
      }
      next()
    } catch (err) {
      console.log('Not Authorized')
      console.log(err)
      return res.status(401).json({ success: false, data: 'Not Authorized' })
    }
  },
)
