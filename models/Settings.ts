import mongoose from 'mongoose'

// Replace mongo-tenant with our custom middleware
import {
  tenantMiddleware,
  type TenantModel,
} from '../middleware/mongoose/tenant-middleware'

interface ISettings {
  companyName?: string
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
  country?: string
  phoneNumber?: string
  companyEmail?: string
  taxNumber?: string
  chamberOfCommerceNumber?: string
  bankName?: string
  bankIBAN?: string
  registerNumber?: string
  agbCode?: string
  website?: string
  companyLogo?: string
  currency?: string
  createdAt: Date
}

// Untyped const preserves the legacy non-standard options (`require`,
// `allowedValues`, `label`) without TS excess-property errors.
const settingsSchemaDefinition = {
  companyName: {
    type: String,
    require: [true, 'Voer een Bedrijfsnaam in'],
    maxLength: 255,
  },
  street: {
    type: String,
    require: [true, 'Voer een Straatnaam in'],
    maxLength: 255,
  },
  houseNumber: {
    type: String,
    require: [true, 'Voer een Huisnummer in'],
    maxLength: 30,
  },
  postalCode: {
    type: String,
    require: [true, 'Voer een Postcode in'],
    maxLength: 10,
  },
  city: {
    type: String,
    require: [true, 'Voer een Woonplaats in'],
    maxLength: 255,
  },
  country: {
    type: String,
    require: [true, 'Kies een land'],
    maxLength: 255,
    allowedValues: ['Nederland', 'België', 'Duitsland', 'Spanje', 'Engeland'],
    default: 'Nederland',
  },
  phoneNumber: {
    type: String,
    require: [true, 'Voer een Telefoonnummer in'],
    maxLength: 25,
  },
  companyEmail: {
    type: String,
    require: [true, 'Voer een Bedrijfs email in'],
    maxLength: 255,
    unique: true,
    maxlength: 255,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ] as [RegExp, string],
  },
  taxNumber: {
    type: String,
    require: [true, 'Voer een BTW nummer in'],
    maxLength: 30,
    label: 'BTW nummer',
  },
  chamberOfCommerceNumber: {
    type: String,
    require: [true, 'Voer een KvK Nummer in'],
    maxLength: 50,
  },
  bankName: {
    type: String,
    require: [true, 'Voer een Bank in'],
    maxLength: 255,
  },
  bankIBAN: {
    type: String,
    require: [true, 'Voer een IBAN in'],
    maxLength: 30,
  },
  registerNumber: {
    type: String,
    require: false,
    maxLength: 50,
  },
  agbCode: {
    type: String,
    require: false,
    maxLength: 50,
  },
  website: {
    type: String,
    require: false,
    maxLength: 100,
  },
  companyLogo: {
    type: String,
    require: false,
    maxLength: 255,
  },
  currency: {
    type: String,
    require: false,
    allowedValues: ['€', '$', '£', '¥'],
    default: '€',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}

const settingsSchema = new mongoose.Schema(settingsSchemaDefinition)

settingsSchema.plugin(tenantMiddleware())

export = mongoose.model<ISettings, TenantModel<ISettings>>(
  'Settings',
  settingsSchema,
  'settings',
)
