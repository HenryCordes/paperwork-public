import 'colors'
import mongoose from 'mongoose'

const connectDB = async (): Promise<void> => {
  // Updated for Mongoose 8 compatibility - removed deprecated options
  const conn = await mongoose.connect(process.env.MONGO_URI as string)
  console.log(
    `Mongo db connected on ${conn.connection.host}`.cyan.underline.bold,
  )
}

export = connectDB
