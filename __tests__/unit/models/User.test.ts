import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'

import User from '../../../models/User'

describe('User model methods', () => {
  it('getSignedJwtToken signs a JWT containing the user id', () => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.JWT_EXPIRES = '1h'
    const user = new User({
      email: 'a@b.com',
      password: 'x',
      organization: new mongoose.Types.ObjectId(),
    })

    const token = user.getSignedJwtToken()
    expect(typeof token).toBe('string')

    const decoded = jwt.verify(token, 'test-secret') as { id: string }
    expect(decoded.id).toBe(String(user._id))
  })

  it('verifyPassword returns true for the correct password, false otherwise', async () => {
    const user = new User({
      email: 'a@b.com',
      organization: new mongoose.Types.ObjectId(),
    })
    user.password = await bcrypt.hash('secret', 10)

    expect(await user.verifyPassword('secret')).toBe(true)
    expect(await user.verifyPassword('wrong')).toBe(false)
  })

  it('generates a 6-char reset token that validates until cleared', () => {
    const user = new User({
      email: 'a@b.com',
      password: 'x',
      organization: new mongoose.Types.ObjectId(),
    })

    const token = user.generateResetToken()
    expect(token).toHaveLength(6)
    expect(user.validateResetToken(token)).toBe(true)
    expect(user.validateResetToken('ZZZZZZ')).toBe(false)

    user.clearResetToken()
    expect(user.validateResetToken(token)).toBe(false)
  })
})
