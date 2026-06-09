// __tests__/setup/authHarness.ts
import Organization from '../../models/Organization'
import Subscription from '../../models/Subscription'
import User from '../../models/User'

export interface AuthedTenant {
  organizationId: string
  userId: string
  token: string
}

let counter = 0

export const createAuthedTenant = async (): Promise<AuthedTenant> => {
  counter += 1

  const org = await Organization.create({
    name: `Test Org ${counter}`,
  })

  const user = await User.create({
    name: `Test User ${counter}`,
    email: `tenant${counter}@example.com`,
    password: 'password123',
    organization: org._id,
  })

  // tenantId is required by the tenant-middleware plugin; pass it explicitly
  // since we are calling .create() directly rather than createWithTenant().
  await Subscription.create({
    tenantId: org._id.toString(),
    owner: user._id,
    subscriptionStatus: 'active',
    nextPaymentDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  })

  const token = user.getSignedJwtToken()

  return {
    organizationId: org._id.toString(),
    userId: user._id.toString(),
    token,
  }
}

export const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
})
