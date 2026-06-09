import mongoose, { Schema } from 'mongoose'
import mongooseSequence from 'mongoose-sequence'

// Import our custom middleware for tenant and pagination (still JS)
import { paginationMiddleware } from '../middleware/mongoose/pagination-middleware'
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

const AutoIncrement = mongooseSequence(mongoose)

interface IEmail {
  owner: mongoose.Types.ObjectId
  emailDate: Date
  subject: string
  body: string
  send: boolean
  invoiceId?: string
  invoiceNumber: string
  invoiceInfo?: string
  contactId?: string
  contactName?: string
  contactEmail?: string
  createdAt: Date
}

// Defined as an untyped const so the legacy non-standard schema options
// (e.g. the `require` typo) are preserved without TS excess-property errors.
const emailSchemaDefinition = {
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  emailDate: {
    type: Date,
    require: true,
    default: Date.now,
    index: true,
  },
  subject: {
    type: String,
    require: true,
    maxLength: 255,
  },
  body: {
    type: String,
    require: true,
    maxLength: 2255,
  },
  send: {
    type: Boolean,
    require: true,
    default: false,
  },
  invoiceId: {
    type: String,
    require: false,
    maxLength: 255,
    index: true,
  },
  invoiceNumber: {
    type: String,
    require: true,
  },
  invoiceInfo: {
    type: String,
    require: false,
    maxLength: 255,
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
  contactEmail: {
    type: String,
    require: false,
    maxLength: 255,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ] as [RegExp, string],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}

const emailSchema = new mongoose.Schema(emailSchemaDefinition)

emailSchema.plugin(paginationMiddleware)
emailSchema.plugin(tenantMiddleware())
emailSchema.plugin(AutoIncrement, {
  id: 'email_seq',
  inc_field: 'emailNumber',
  reference_fields: ['tenantId'],
  start_seq: 1501,
  disable_hooks: false, // Explicitly enable hooks for Mongoose 8
})

// Explicitly set the collection name to match the existing database
export = mongoose.model<IEmail, TenantModel<IEmail>>(
  'Email',
  emailSchema,
  'emails',
)
