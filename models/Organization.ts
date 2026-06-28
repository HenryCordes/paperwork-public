import mongoose, { Schema } from 'mongoose'

interface IOrganization {
  name?: string
  createdAt: Date
}

const organizationSchema = new Schema<IOrganization>({
  name: {
    type: String,
    require: [false, 'Please add a companyName'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

export = mongoose.model<IOrganization>('Organization', organizationSchema)
