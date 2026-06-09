import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

// Singleton instance of MongoDB Memory Server
let mongoServer: MongoMemoryServer

/**
 * Connect to the in-memory database.
 */
export const connect = async (): Promise<void> => {
  mongoServer = await MongoMemoryServer.create()
  const uri = mongoServer.getUri()

  await mongoose.connect(uri)
}

/**
 * Drop database, close the connection and stop mongod.
 */
export const closeDatabase = async (): Promise<void> => {
  await mongoose.connection.dropDatabase()
  await mongoose.connection.close()
  await mongoServer.stop()
}

/**
 * Remove all data from collections (but keep collections).
 */
export const clearDatabase = async (): Promise<void> => {
  const collections = mongoose.connection.collections

  for (const key in collections) {
    const collection = collections[key]
    await collection.deleteMany({})
  }
}
