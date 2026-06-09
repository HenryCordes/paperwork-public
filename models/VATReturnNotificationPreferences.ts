import mongoose, { HydratedDocument } from 'mongoose'

import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

interface IVATPrefs {
  userId: mongoose.Types.ObjectId
  tenantId: string
  emailNotifications: boolean
  inAppNotifications: boolean
  pushNotifications: boolean
  advanceWarningDays: number
  secondReminderEnabled: boolean
  secondReminderDays: number
  monthlyNotifications: boolean
  quarterlyNotifications: boolean
  yearlyNotifications: boolean
  lastNotificationSent?: Date | null
  notificationsSentCount: number
  preferredLanguage: 'nl' | 'en'
  timezone: string
}

interface IVATPrefsMethods {
  isNotificationEnabledForPeriod(periodType: string): boolean
}

interface IVATPrefsModel extends TenantModel<IVATPrefs, IVATPrefsMethods> {
  getOrCreatePreferences(
    userId: mongoose.Types.ObjectId | string,
    tenantId: string,
  ): Promise<HydratedDocument<IVATPrefs, IVATPrefsMethods>>
}

/**
 * VAT Return Notification Preferences Model
 * Stores user preferences for VAT deadline notifications
 */
const vatPrefsSchemaDefinition = {
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  tenantId: {
    type: String,
    required: true,
    index: true,
  },

  // Notification channels
  emailNotifications: { type: Boolean, default: true },
  inAppNotifications: { type: Boolean, default: true },
  pushNotifications: { type: Boolean, default: false },

  // Timing preferences (days before deadline)
  advanceWarningDays: { type: Number, default: 7, min: 1, max: 30 },

  // Additional reminder (optional second notification)
  secondReminderEnabled: { type: Boolean, default: false },
  secondReminderDays: { type: Number, default: 3, min: 1, max: 15 },

  // Period type preferences
  monthlyNotifications: { type: Boolean, default: true },
  quarterlyNotifications: { type: Boolean, default: true },
  yearlyNotifications: { type: Boolean, default: true },

  // Notification history tracking
  lastNotificationSent: { type: Date, default: null },
  notificationsSentCount: { type: Number, default: 0 },

  // User preferences
  preferredLanguage: { type: String, enum: ['nl', 'en'], default: 'nl' },
  timezone: { type: String, default: 'Europe/Amsterdam' },
}

const vatReturnNotificationPreferencesSchema = new mongoose.Schema(
  vatPrefsSchemaDefinition,
  {
    timestamps: true,
    collection: 'vatreturnnotificationpreferences',
  },
)

// Apply tenant middleware for multi-tenant support
vatReturnNotificationPreferencesSchema.plugin(tenantMiddleware())

// Compound index for efficient queries
vatReturnNotificationPreferencesSchema.index(
  { userId: 1, tenantId: 1 },
  { unique: true },
)

// Static method to get or create preferences for a user
vatReturnNotificationPreferencesSchema.statics.getOrCreatePreferences =
  async function (userId: mongoose.Types.ObjectId | string, tenantId: string) {
    let preferences = await this.findOne({ userId, tenantId })

    if (!preferences) {
      preferences = await this.create({
        userId,
        tenantId,
        // Default values will be applied automatically
      })
    }

    return preferences
  }

// Instance method to check if notifications are enabled for a period type
vatReturnNotificationPreferencesSchema.methods.isNotificationEnabledForPeriod =
  function (this: HydratedDocument<IVATPrefs>, periodType: string): boolean {
    switch (periodType) {
      case 'monthly':
        return this.monthlyNotifications
      case 'quarterly':
        return this.quarterlyNotifications
      case 'yearly':
        return this.yearlyNotifications
      default:
        return false
    }
  }

export = mongoose.model<IVATPrefs, IVATPrefsModel>(
  'VATReturnNotificationPreferences',
  vatReturnNotificationPreferencesSchema,
)
