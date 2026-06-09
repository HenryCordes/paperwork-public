import mongoose, { Schema } from 'mongoose'
import mongooseSequence from 'mongoose-sequence'

// Import our custom middleware for tenant and pagination
import { paginationMiddleware } from '../middleware/mongoose/pagination-middleware'
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

const AutoIncrement = mongooseSequence(mongoose)

interface IInvoiceLine {
  description: string
  priceWOTaxes: number
  priceIncludingTax: number
  taxRate: number
  numberOfItems: number
  totalLinePrice: number
}

interface IInvoice {
  owner: mongoose.Types.ObjectId
  invoiceNumber: number
  invoiceDate: Date
  payDate?: Date
  info?: string
  tax?: number
  taxLow?: number
  taxLowest?: number
  priceWithoutTaxes?: number
  priceIncludingTax?: number
  price?: number
  state?: string
  contactId?: string
  contactName?: string
  invoiceLines?: IInvoiceLine[]
  createdAt: Date
}

// Untyped consts preserve legacy non-standard options without TS errors.
const invoiceLineSchemaDefinition = {
  description: {
    type: String,
    require: [true, 'Voer een omscrijving in'],
    maxLength: 255,
  },
  priceWOTaxes: {
    type: Number,
    require: true,
  },
  priceIncludingTax: {
    type: Number,
    require: true,
  },
  taxRate: {
    type: Number,
    require: true,
    allowedValues: [21, 9, 6, 0],
  },
  numberOfItems: {
    type: Number,
    require: true,
    label: 'Aantal',
  },
  totalLinePrice: {
    type: Number,
    require: true,
  },
}

const invoiceLineSchema = new mongoose.Schema(invoiceLineSchemaDefinition)

const invoiceSchemaDefinition = {
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  invoiceNumber: {
    type: Number,
    require: true,
  },
  invoiceDate: {
    type: Date,
    require: [true, 'Voer een Factuurdatum in'],
    default: Date.now,
    index: true,
  },
  payDate: {
    type: Date,
    require: false,
    label: 'Betaaldatum',
    default: new Date(+new Date() + 30 * 24 * 60 * 60 * 1000),
    index: true,
  },
  info: {
    type: String,
    require: false,
    maxLength: 255,
  },
  tax: {
    type: Number,
    require: false,
  },
  taxLow: {
    type: Number,
    require: false,
  },
  taxLowest: {
    type: Number,
    require: false,
  },
  priceWithoutTaxes: {
    type: Number,
    require: false,
  },
  priceIncludingTax: {
    type: Number,
    require: false,
  },
  price: {
    type: Number,
    require: false,
  },
  state: {
    type: String,
    require: false,
    allowedValues: ['Open', 'Te laat', 'Betaald'],
    default: 'Open',
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
  invoiceLines: {
    type: [invoiceLineSchema],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}

const invoiceSchema = new mongoose.Schema(invoiceSchemaDefinition)

invoiceSchema.plugin(paginationMiddleware)
invoiceSchema.plugin(tenantMiddleware())
invoiceSchema.plugin(AutoIncrement, {
  id: 'invoice_counter',
  inc_field: 'invoiceNumber',
  reference_fields: ['tenantId', 'invoicePrefix'],
  start_seq: 1001,
  disable_hooks: false, // Explicitly enable hooks for Mongoose 8
})

// Explicitly set the collection name to match the existing database
export = mongoose.model<IInvoice, TenantModel<IInvoice>>(
  'Invoice',
  invoiceSchema,
  'invoices',
)
