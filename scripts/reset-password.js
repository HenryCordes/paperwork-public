const mongoose = require('mongoose')
const User = require('../models/User')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')

// Configure the environment variables using the same path as the main application
dotenv.config({ path: './config/config.env' })

// Usage: node reset-password.js <email> <new_password>
// Example: node reset-password.js user@example.com newPassword123

async function resetPassword() {
  // Check if email and password are provided
  if (process.argv.length < 4) {
    console.log('Usage: node reset-password.js <email> <new_password>')
    process.exit(1)
  }

  const email = process.argv[2]
  const newPassword = process.argv[3]

  try {
    // Connect to MongoDB - using the same approach as in the main app
    await mongoose.connect(process.env.MONGO_URI)

    console.log('Connected to MongoDB')

    // Find user by email
    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      console.log(`User with email ${email} not found.`)
      process.exit(1)
    }

    // Set the new password - the pre-save hook in the User model will handle hashing
    user.password = newPassword

    // Save the user - this will trigger the pre-save hook to hash the password
    await user.save()

    console.log(`Password reset successful for user: ${email}`)
  } catch (error) {
    console.error('Error resetting password:', error)
    process.exit(1)
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

resetPassword()
