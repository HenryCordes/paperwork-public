import mongoose, { Schema } from 'mongoose'
import mongooseSequence from 'mongoose-sequence'

import { paginationMiddleware } from '../middleware/mongoose/pagination-middleware'
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

const AutoIncrement = mongooseSequence(mongoose)

interface IExpense {
  owner: mongoose.Types.ObjectId
  expenseNumber: number
  expenseDate: Date
  info?: string
  tax: number
  taxLow: number
  priceWOTaxes?: number
  price?: number
  contactId?: string
  contactName?: string
  expenseFile?: string
  createdAt: Date
}

// Untyped const preserves legacy non-standard options without TS errors.
const expenseSchemaDefinition = {
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  expenseNumber: {
    type: Number,
    require: true,
  },
  expenseDate: {
    type: Date,
    require: [true, 'Voer een kosten datum in'],
    default: Date.now,
    index: true,
  },
  info: {
    type: String,
    require: false,
    maxLength: 255,
  },
  tax: {
    type: Number,
    require: [true, 'Voer btw hoog in'],
  },
  taxLow: {
    type: Number,
    require: [true, 'Voer btw laag in'],
  },
  priceWOTaxes: {
    type: Number,
    require: false,
  },
  price: {
    type: Number,
    require: false,
  },
  contactId: {
    type: String,
    require: false,
    maxLength: 255,
    index: true,
  },
  contactName: {
    type: String,
    require: false,
    maxLength: 255,
  },
  expenseFile: {
    type: String,
    require: false,
    maxLength: 500,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}

const expenseSchema = new mongoose.Schema(expenseSchemaDefinition)

expenseSchema.plugin(paginationMiddleware)
expenseSchema.plugin(tenantMiddleware())
expenseSchema.plugin(AutoIncrement, {
  id: 'expense_seq',
  inc_field: 'expenseNumber',
  reference_fields: ['tenantId'],
  start_seq: 1001,
  disable_hooks: false, // Explicitly enable hooks for Mongoose 8
})

// Explicitly set the collection name to match the existing database
export = mongoose.model<IExpense, TenantModel<IExpense>>(
  'Expense',
  expenseSchema,
  'expenses',
)
