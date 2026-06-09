import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose, { Schema, Model, HydratedDocument } from 'mongoose'

interface IUser {
  name?: string
  companyName?: string
  email: string
  role: 'user' | 'admin'
  password: string
  resetToken?: string
  // Stored as an epoch millisecond number at runtime (see generateResetToken).
  resetTokenExpiry?: number
  createdAt: Date
  organization: mongoose.Types.ObjectId
}

interface IUserMethods {
  getSignedJwtToken(): string
  verifyPassword(enteredPassword: string): Promise<boolean>
  generateResetToken(): string
  validateResetToken(token: string): boolean
  clearResetToken(): void
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>

// Untyped const preserves the legacy non-standard `require` typos without
// TS excess-property errors; the real `required`/`match` arrays are tuple-cast.
const userSchemaDefinition = {
  name: {
    type: String,
    require: [true, 'Please add a lastName'],
  },
  companyName: {
    type: String,
    require: [false, 'Please add a companyName'],
  },
  email: {
    type: String,
    required: [true, 'Please add an email'] as [boolean, string],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ] as [RegExp, string],
    index: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  password: {
    type: String,
    required: [true, 'Please enter a password'] as [boolean, string],
    minlength: 6,
    select: false,
  },
  resetToken: {
    type: String,
    select: false,
  },
  resetTokenExpiry: {
    type: Date,
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    require: true,
  },
}

const userSchema = new mongoose.Schema(userSchemaDefinition)

// Hashing the password before saving to db.
userSchema.pre(
  'save',
  async function (
    this: HydratedDocument<IUser>,
    next: mongoose.CallbackWithoutResultAndOptionalError,
  ) {
    if (!this.isModified('password')) {
      next()
    }
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
  },
)

// Signing the JWT token with the _id of user.
userSchema.methods.getSignedJwtToken = function (
  this: HydratedDocument<IUser>,
): string {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES as jwt.SignOptions['expiresIn'],
  })
}

// Comparing the entered password with hashed password
userSchema.methods.verifyPassword = async function (
  this: HydratedDocument<IUser>,
  enteredPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password)
}

// Generate password reset token
userSchema.methods.generateResetToken = function (
  this: HydratedDocument<IUser>,
): string {
  // Generate 6-character alphanumeric token
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let resetToken = ''
  for (let i = 0; i < 6; i++) {
    resetToken += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  // Set token and expiry (default 10 minutes, configurable via env var)
  this.resetToken = resetToken
  const expiryMinutes = Number(process.env.RESET_TOKEN_EXPIRY_MINUTES) || 10
  this.resetTokenExpiry = Date.now() + expiryMinutes * 60 * 1000

  return resetToken
}

// Validate reset token
userSchema.methods.validateResetToken = function (
  this: HydratedDocument<IUser>,
  token: string,
): boolean {
  return (
    this.resetToken === token &&
    this.resetTokenExpiry !== undefined &&
    Date.now() < this.resetTokenExpiry
  )
}

// Clear reset token
userSchema.methods.clearResetToken = function (
  this: HydratedDocument<IUser>,
): void {
  this.resetToken = undefined
  this.resetTokenExpiry = undefined
}

export = mongoose.model<IUser, UserModel>('User', userSchema)
