import { createNamespace, getNamespace } from 'cls-hooked'
import { Request, Response, NextFunction } from 'express'

const ns = createNamespace('request')
const requestStorage = getNamespace('request')

export const bindCurrentNamespace = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  ns.bindEmitter(req)
  ns.bindEmitter(res)

  ns.run(() => {
    // First check if user object is attached to the request
    if (req.user && req.user.organization) {
      const tenantId = req.user.organization.toString()
      ns.set('tenantId', tenantId)
    }
    // Fallback to organizationId if already set by another middleware
    else if (req.organizationId) {
      ns.set('tenantId', req.organizationId.toString())
    }
    next()
  })
}

export const getCurrentTenantId = (tenantIdFromOrg?: string) => {
  const tenant = requestStorage.get('tenantId')
  return tenant || tenantIdFromOrg
}

export const setCurrentTenantId = (tenantId: string) => {
  return ns.set('tenantId', tenantId)
}
