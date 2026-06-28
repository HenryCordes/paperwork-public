import mongoose, { Schema } from 'mongoose'

import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

interface INotification {
  userId: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  title: string
  body: string
  type: 'expense' | 'invoice' | 'vat_deadline' | 'general'
  targetId?: string
  action?: 'view' | 'edit'
  read: boolean
  received: boolean
  receivedAt?: Date
  data?: unknown
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxLength: 255,
    },
    body: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    type: {
      type: String,
      enum: ['expense', 'invoice', 'vat_deadline', 'general'],
      required: true,
      default: 'general',
    },
    targetId: {
      type: String,
      required: false,
    },
    action: {
      type: String,
      enum: ['view', 'edit'],
      required: false,
      default: 'view',
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    received: {
      type: Boolean,
      default: false,
      index: true,
    },
    receivedAt: {
      type: Date,
      required: false,
    },
    data: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  },
)

NotificationSchema.index({ userId: 1, tenantId: 1, read: 1 })
NotificationSchema.index({ userId: 1, tenantId: 1, type: 1 })
NotificationSchema.index({ createdAt: -1 })

tenantMiddleware(true)(NotificationSchema)

export = mongoose.model<INotification, TenantModel<INotification>>(
  'Notification',
  NotificationSchema,
)
