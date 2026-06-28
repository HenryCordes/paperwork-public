import mongoose, { HydratedDocument } from 'mongoose'

import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

interface IDashboardStatsValues {
  totalRevenue: number
  paidRevenue: number
  invoiceCount: number
  totalExpenses: number
  paidExpenses: number
  expenseCount: number
  netProfit: number
  // Stored as a Mongoose Map; surfaces as a plain object after .lean().
  expensesByCategory: Record<string, number>
  revenueByClient: Record<string, number>
  taxCollected: number
  taxPaid: number
}

interface IDashboardStats {
  tenantId: string
  periodKey: string
  periodType: 'daily' | 'monthly' | 'quarterly' | 'yearly'
  periodStart: Date
  periodEnd: Date
  stats: IDashboardStatsValues
  lastUpdated: Date
}

interface IDashboardStatsModel extends TenantModel<IDashboardStats> {
  findOrCreateStats(
    tenantId: string,
    periodType: string,
    periodKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<HydratedDocument<IDashboardStats>>
  updateStats(
    tenantId: string,
    periodType: string,
    periodKey: string,
    updateData: Partial<IDashboardStatsValues>,
  ): Promise<HydratedDocument<IDashboardStats> | null>
}

// Schema for DashboardStats - stores pre-aggregated statistics for dashboards.
const dashboardStatsSchemaDefinition = {
  tenantId: {
    type: String,
    required: true,
    index: true,
  },
  periodKey: {
    type: String,
    required: true,
    index: true,
  },
  periodType: {
    type: String,
    enum: ['daily', 'monthly', 'quarterly', 'yearly'],
    required: true,
    index: true,
  },
  periodStart: {
    type: Date,
    required: true,
    index: true,
  },
  periodEnd: {
    type: Date,
    required: true,
    index: true,
  },
  stats: {
    totalRevenue: { type: Number, default: 0 },
    paidRevenue: { type: Number, default: 0 },
    invoiceCount: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    paidExpenses: { type: Number, default: 0 },
    expenseCount: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    expensesByCategory: { type: Map, of: Number, default: {} },
    revenueByClient: { type: Map, of: Number, default: {} },
    taxCollected: { type: Number, default: 0 },
    taxPaid: { type: Number, default: 0 },
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}

const dashboardStatsSchema = new mongoose.Schema(dashboardStatsSchemaDefinition)

// Create compound indexes for efficient querying
dashboardStatsSchema.index({
  tenantId: 1,
  periodType: 1,
  periodStart: 1,
  periodEnd: 1,
})
dashboardStatsSchema.index(
  { tenantId: 1, periodKey: 1, periodType: 1 },
  { unique: true },
)

// Add tenant middleware for multi-tenancy support
dashboardStatsSchema.plugin(tenantMiddleware())

// Method to find or create stats for a specific period
dashboardStatsSchema.statics.findOrCreateStats = async function (
  tenantId: string,
  periodType: string,
  periodKey: string,
  periodStart: Date,
  periodEnd: Date,
) {
  let stats = await this.findOne({
    tenantId,
    periodType,
    periodKey,
  })

  if (!stats) {
    stats = await this.create({
      tenantId,
      periodType,
      periodKey,
      periodStart,
      periodEnd,
      stats: {
        totalRevenue: 0,
        paidRevenue: 0,
        invoiceCount: 0,
        totalExpenses: 0,
        paidExpenses: 0,
        expenseCount: 0,
        netProfit: 0,
        expensesByCategory: {},
        revenueByClient: {},
        taxCollected: 0,
        taxPaid: 0,
      },
      lastUpdated: new Date(),
    })
  }

  return stats
}

// Method to update stats for a specific period
dashboardStatsSchema.statics.updateStats = async function (
  tenantId: string,
  periodType: string,
  periodKey: string,
  updateData: Partial<IDashboardStatsValues>,
) {
  return this.findOneAndUpdate(
    {
      tenantId,
      periodType,
      periodKey,
    },
    {
      $set: {
        stats: updateData,
        lastUpdated: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
    },
  )
}

// Export the model with collection name explicitly set
export = mongoose.model<IDashboardStats, IDashboardStatsModel>(
  'DashboardStats',
  dashboardStatsSchema,
  'dashboardStats',
)
