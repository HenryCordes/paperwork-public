/**
 * Custom pagination middleware to replace mongoose-paginate-v2
 * Compatible with Mongoose 5+ and ready for Mongoose 8
 */

import { Schema } from 'mongoose'

interface PaginateOptions {
  offset?: number | string
  limit?: number | string
  sort?: Record<string, unknown>
  lean?: boolean
}

export function paginationMiddleware(schema: Schema): void {
  /**
   * Pagination method that mimics the mongoose-paginate-v2 interface.
   */
  schema.statics.paginate = async function (
    query: Record<string, unknown> = {},
    options: PaginateOptions = {},
  ) {
    // Parse options with defaults
    const offset = parseInt(String(options.offset), 10) || 0
    const limit = parseInt(String(options.limit), 10) || 10
    const sort = options.sort || {}
    const lean = options.lean !== false // Default to true

    // For compatibility with mongoose-paginate-v2
    const page = Math.floor(offset / limit) + 1

    // Get total count
    const totalDocs = await this.countDocuments(query)
    const totalPages = Math.ceil(totalDocs / limit)

    // Get paginated documents
    let docsQuery = this.find(query)

    if (Object.keys(sort).length > 0) {
      docsQuery = docsQuery.sort(sort)
    }

    docsQuery = docsQuery.skip(offset).limit(limit)

    if (lean) {
      docsQuery = docsQuery.lean()
    }

    const docs = await docsQuery.exec()

    // Return in the same format as mongoose-paginate-v2
    return {
      docs,
      totalDocs,
      limit,
      totalPages,
      page,
      pagingCounter: offset + 1,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
      offset,
    }
  }
}
