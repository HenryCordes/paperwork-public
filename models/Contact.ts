import mongoose, { Schema } from 'mongoose'
import mongooseSequence from 'mongoose-sequence'

// Import our custom middleware for tenant and pagination
import { paginationMiddleware } from '../middleware/mongoose/pagination-middleware'
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

const AutoIncrement = mongooseSequence(mongoose)

interface IContact {
  owner: mongoose.Types.ObjectId
  contactNumber: number
  companyName?: string
  typeOfContact?: string
  lastName?: string
  firstName?: string
  initials?: string
  gender?: string
  emailAddress?: string
  phoneNumber?: string
  mobilePhoneNumber?: string
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
  country?: string
  visitingStreet?: string
  visitingHouseNumber?: string
  visitingPostalCode?: string
  visitingCity?: string
  visitingCountry?: string
  bankIBAN?: string
  bankPersonName?: string
  channel?: string
  history?: string
  typeName?: string
  createdAt: Date
}

// Untyped const preserves legacy non-standard options without TS errors.
const contactSchemaDefinition = {
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    require: true,
  },
  contactNumber: {
    type: Number,
    require: [true, 'Voer een ContactNummer in'],
  },
  companyName: {
    type: String,
    require: false,
    maxlength: 50,
  },
  typeOfContact: {
    type: String,
    allowedValues: ['Klant', 'Leverancier'],
    require: [true, 'Kies een type'],
  },
  lastName: {
    type: String,
    require: [true, 'Voer de Achternaam in'],
    maxlength: 255,
  },
  firstName: {
    type: String,
    require: [true, 'Voer de Voornaam in'],
    maxlength: 255,
  },
  initials: {
    type: String,
    require: false,
    maxlength: 10,
  },
  gender: {
    type: String,
    allowedValues: ['Man', 'Vrouw'],
    require: false,
  },
  emailAddress: {
    type: String,
    required: [true, 'Voer email in'] as [boolean, string],
    unique: true,
    maxlength: 255,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ] as [RegExp, string],
  },
  phoneNumber: {
    type: String,
    require: false,
    maxlength: 25,
  },
  mobilePhoneNumber: {
    type: String,
    require: false,
    maxlength: 25,
  },
  street: {
    type: String,
    require: false,
    maxlength: 255,
  },
  houseNumber: {
    type: String,
    require: false,
    maxlength: 30,
  },
  postalCode: {
    type: String,
    require: false,
    maxlength: 10,
  },
  city: {
    type: String,
    require: false,
    maxlength: 255,
  },
  country: {
    type: String,
    require: false,
    maxlength: 255,
    allowedValues: ['Nederland', 'België', 'Duitsland', 'Spanje', 'Engeland'],
  },
  visitingStreet: {
    type: String,
    require: false,
    maxlength: 255,
  },
  visitingHouseNumber: {
    type: String,
    require: false,
    maxlength: 30,
  },
  visitingPostalCode: {
    type: String,
    require: false,
    maxlength: 10,
  },
  visitingCity: {
    type: String,
    require: false,
    maxlength: 255,
  },
  visitingCountry: {
    type: String,
    require: false,
    maxlength: 255,
    allowedValues: ['Nederland', 'België', 'Duitsland', 'Spanje', 'Engeland'],
  },
  bankIBAN: {
    type: String,
    require: false,
    maxlength: 30,
  },
  bankPersonName: {
    type: String,
    require: false,
    maxlength: 255,
  },
  channel: {
    type: String,
    require: false,
    maxlength: 75,
  },
  history: {
    type: String,
    require: false,
    maxlength: 1024,
  },
  typeName: {
    type: String,
    allowedValues: ['Particulier', 'Bedrijf'],
    require: [true, 'Kies het type'],
    maxlength: 255,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}

const contactSchema = new mongoose.Schema(contactSchemaDefinition)

contactSchema.plugin(paginationMiddleware)
contactSchema.plugin(tenantMiddleware())
contactSchema.plugin(AutoIncrement, {
  id: 'contact_seq',
  inc_field: 'contactNumber',
  reference_fields: ['tenantId'],
  start_seq: 2025120030,
  disable_hooks: false, // Explicitly enable hooks for Mongoose 8
})

export = mongoose.model<IContact, TenantModel<IContact>>(
  'Contact',
  contactSchema,
  'contacts',
)
