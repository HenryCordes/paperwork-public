import mongoose, { Schema } from 'mongoose'

// Replace mongo-tenant with our custom middleware
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

interface ISubscription {
  owner: mongoose.Types.ObjectId
  subscriptionDate: Date
  subscriptionPayDate?: Date
  plan: string
  customerId?: string
  orderId?: string
  paymentId?: string
  paymentState?: string
  paymentPrice?: string
  paymentCurrency?: string
  userId?: string
  userIds?: string[]
  mollieSubscriptionId?: string
  subscriptionStatus?: string
  paymentFailCount: number
  cancelDate?: Date
  nextPaymentDate?: Date
  welcomeEmailSent: boolean
  createdAt: Date
}

// Untyped const preserves the legacy non-standard options (`require`,
// `allowedValues`) without TS excess-property errors.
const subscriptionSchemaDefinition = {
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  subscriptionDate: {
    type: Date,
    require: true,
    default: Date.now,
  },
  subscriptionPayDate: {
    type: Date,
    require: false,
  },
  plan: {
    type: String,
    require: true,
    maxLength: 255,
    allowedValues: ['Essentials', 'Essentials Year', 'Premium', 'Professional'],
    default: 'Essentials',
  },
  customerId: {
    type: String,
    require: false,
    maxLength: 255,
    index: true,
  },
  orderId: {
    type: String,
    require: false,
    maxLength: 255,
    index: true,
  },
  paymentId: {
    type: String,
    require: false,
    maxLength: 255,
    index: true,
  },
  paymentState: {
    type: String,
    require: false,
    maxLength: 255,
    allowedValues: ['paid', 'open', 'aborted'],
    default: 'open',
  },
  paymentPrice: {
    type: String,
    require: false,
  },
  paymentCurrency: {
    type: String,
    require: false,
  },
  userId: {
    type: String,
    require: false,
  },
  userIds: {
    type: [String],
    require: false,
    maxLength: 255,
    index: true,
  },
  mollieSubscriptionId: {
    type: String,
    require: false,
    maxLength: 255,
    index: true,
  },
  subscriptionStatus: {
    type: String,
    require: false,
    allowedValues: [
      'pending',
      'active',
      'suspended',
      'canceled',
      'payment_issue',
      'payment_overdue',
    ],
    default: 'pending',
  },
  paymentFailCount: {
    type: Number,
    default: 0,
  },
  cancelDate: {
    type: Date,
  },
  nextPaymentDate: {
    type: Date,
    require: false,
  },
  welcomeEmailSent: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}

const subscriptionSchema = new mongoose.Schema(subscriptionSchemaDefinition)

subscriptionSchema.plugin(tenantMiddleware())

export = mongoose.model<ISubscription, TenantModel<ISubscription>>(
  'Subscription',
  subscriptionSchema,
  'subscriptions',
)
