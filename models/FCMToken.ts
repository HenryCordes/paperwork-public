import mongoose, { Schema } from 'mongoose'

import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

interface IFCMToken {
  userId: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  token: string
  platform: 'ios' | 'android' | 'web'
  isActive: boolean
  lastUsed: Date
}

const FCMTokenSchema = new Schema<IFCMToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)
// Compound index for efficient tenant-based queries
FCMTokenSchema.index({ userId: 1, tenantId: 1 })
// Note: token index is already created by 'unique: true' in schema definition
FCMTokenSchema.index({ isActive: 1 })

// Apply tenant middleware to ensure multi-tenant data isolation
tenantMiddleware(true)(FCMTokenSchema)

export = mongoose.model<IFCMToken, TenantModel<IFCMToken>>(
  'FCMToken',
  FCMTokenSchema,
)
