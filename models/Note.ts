import mongoose, { Schema } from 'mongoose'
import mongooseSequence from 'mongoose-sequence'

// Replace mongo-tenant with our custom middleware (still JS; typed as any)
import { paginationMiddleware } from '../middleware/mongoose/pagination-middleware'
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

const AutoIncrement = mongooseSequence(mongoose)

interface INote {
  owner: mongoose.Types.ObjectId
  noteNumber: number
  noteDate: Date
  description: string
  contactId?: string
  contactName?: string
  createdAt: Date
}

const noteSchema = new Schema<INote>({
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  noteNumber: {
    type: Number,
    require: true,
  },
  noteDate: {
    type: Date,
    require: true,
    default: Date.now,
  },
  description: {
    type: String,
    require: true,
    maxLength: 2255,
    label: 'Omschrijving',
  },
  contactId: {
    type: String,
    require: false,
    max: 255,
    index: true,
  },
  contactName: {
    type: String,
    require: false,
    maxLength: 255,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

noteSchema.plugin(paginationMiddleware)
noteSchema.plugin(tenantMiddleware())
noteSchema.plugin(AutoIncrement, {
  id: 'note_seq',
  inc_field: 'noteNumber',
  reference_fields: ['tenantId'],
  start_seq: 1501,
  disable_hooks: false, // Explicitly enable hooks for Mongoose 8
})

export = mongoose.model<INote, TenantModel<INote>>('Note', noteSchema, 'notes')
