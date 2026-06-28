import { getNamespace } from 'cls-hooked'
import {
  Schema,
  Query,
  Document,
  Model,
  HydratedDocument,
  UpdateQuery,
  QueryOptions,
  MongooseQueryMiddleware,
  CallbackWithoutResultAndOptionalError,
} from 'mongoose'

// Use the existing cls-hooked namespace for tenant context
const clsNamespace = getNamespace('request')

// A query carrying the internal opt-out flag set by skipTenantFilter().
type TenantQuery = Query<unknown, unknown> & { _skipTenantFilter?: boolean }

export interface PaginateOptions {
  offset?: number | string
  limit?: number | string
  sort?: Record<string, unknown>
  lean?: boolean
}

export interface PaginateResult<T> {
  docs: T[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
  offset: number
}

/** Queries scoped to a fixed tenant id, returned by `Model.byTenant()`. */
export interface TenantScopedQueries<T> {
  // NOTE: `projection` is accepted for call-site compatibility, but the
  // byTenant runtime below forwards only the query (projection is dropped).
  find(
    query?: Record<string, unknown>,
    projection?: Record<string, unknown>,
  ): Query<HydratedDocument<T>[], HydratedDocument<T>, Record<string, never>, T>
  findOne(
    query?: Record<string, unknown>,
  ): Query<
    HydratedDocument<T> | null,
    HydratedDocument<T>,
    Record<string, never>,
    T
  >
  findById(
    id: unknown,
  ): Query<
    HydratedDocument<T> | null,
    HydratedDocument<T>,
    Record<string, never>,
    T
  >
  findByIdAndUpdate(
    id: unknown,
    update: UpdateQuery<T>,
    options?: QueryOptions,
  ): Query<
    HydratedDocument<T> | null,
    HydratedDocument<T>,
    Record<string, never>,
    T
  >
  findOneAndUpdate(
    query: Record<string, unknown>,
    update: UpdateQuery<T>,
    options?: QueryOptions,
  ): Query<
    HydratedDocument<T> | null,
    HydratedDocument<T>,
    Record<string, never>,
    T
  >
  findByIdAndDelete(
    id: unknown,
  ): Query<
    HydratedDocument<T> | null,
    HydratedDocument<T>,
    Record<string, never>,
    T
  >
  update(
    query: Record<string, unknown>,
    update: UpdateQuery<T>,
    options?: QueryOptions,
  ): Query<unknown, HydratedDocument<T>>
  deleteMany(
    query?: Record<string, unknown>,
  ): Query<unknown, HydratedDocument<T>>
  countDocuments(
    query?: Record<string, unknown>,
  ): Query<number, HydratedDocument<T>>
  create(data: Record<string, unknown>): Promise<HydratedDocument<T>>
  paginate(
    query?: Record<string, unknown>,
    options?: PaginateOptions,
  ): Promise<PaginateResult<HydratedDocument<T>>>
}

/**
 * A Mongoose model extended with the statics this tenant plugin (and the
 * pagination plugin) attach at runtime. Tenant-scoped models are declared as
 * `model<IFoo, TenantModel<IFoo>>(...)` so these statics are typed at call sites.
 */
export interface TenantModel<T, TMethods = Record<string, never>> extends Model<
  T,
  Record<string, never>,
  TMethods
> {
  createWithTenant(data: Record<string, unknown>): Promise<HydratedDocument<T>>
  skipTenantFilter(): Query<HydratedDocument<T>[], HydratedDocument<T>>
  byTenant(tenantId: string): TenantScopedQueries<T>
  paginate(
    query?: Record<string, unknown>,
    options?: PaginateOptions,
  ): Promise<PaginateResult<HydratedDocument<T>>>
}

// Debug function
export function debug(message: string): void {
  // Only log if DEBUG_TENANT is enabled - easy to disable by removing this env var
  if (process.env.DEBUG_TENANT === 'true') {
    console.log(`[TENANT] ${message}`)
  }
}

/**
 * Get the current tenant ID from the request context.
 * @returns The tenant ID or null if not set
 */
export function getCurrentTenantId(): string | null {
  // Use the existing cls-hooked namespace
  if (clsNamespace) {
    const tenantId = clsNamespace.get('tenantId')
    if (tenantId) {
      debug(`Using tenant ID from context: ${tenantId}`)
      return tenantId
    }
  }
  return null
}

/**
 * Gets the tenant ID from the CLS context.
 * @returns The tenant ID from context, or undefined if not set
 */
function getTenantId(): string | undefined {
  const namespace = clsNamespace
  if (namespace && namespace.active) {
    const tenantId = namespace.get('tenantId')
    debug(`Retrieved tenant ID from context: ${tenantId}`)
    return tenantId
  }
  debug('No tenant ID found in context')
  return undefined
}

/**
 * Run a function with a specific tenant ID in context.
 */
export function withTenant<T>(tenantId: string, callback: () => T): T {
  return clsNamespace.run(() => {
    clsNamespace.set('tenantId', tenantId)
    return callback()
  })
}

interface TenantRequest {
  user?: { organization?: { toString(): string } }
  organizationId?: { toString(): string }
}

/**
 * Express middleware to set tenant context.
 */
export function setTenantContext(
  req: TenantRequest,
  _res: unknown,
  next: () => void,
): void {
  let tenantId: string | null = null

  // Get tenant ID from authenticated user's organization
  if (req.user && req.user.organization) {
    tenantId = req.user.organization.toString()
  }
  // Fallback to organizationId if already set by another middleware
  else if (req.organizationId) {
    tenantId = req.organizationId.toString()
  }

  // If we have a tenant ID, run in tenant context
  if (tenantId) {
    withTenant(tenantId, next)
  } else {
    // No tenant ID available
    next()
  }
}

/**
 * Tenant middleware for Mongoose schemas.
 * @param isTenantScoped - Whether the model is tenant-scoped
 * @returns Mongoose plugin function
 */
export function tenantMiddleware(isTenantScoped = true) {
  return function (schema: Schema): void {
    // Only add tenantId field if this schema is tenant-scoped
    if (!isTenantScoped) {
      return
    }

    // Add tenantId to schema
    schema.add({
      tenantId: {
        type: String, // Using String to match how it's stored in the database
        required: true,
        index: true,
      },
    })

    // Add pre-find hooks to filter by tenant
    const operations = [
      'find',
      'findOne',
      'findOneAndUpdate',
      'findOneAndDelete',
      'count',
      'countDocuments',
    ] as const

    operations.forEach((op) => {
      schema.pre(
        op as MongooseQueryMiddleware,
        function (next: CallbackWithoutResultAndOptionalError) {
          const q = this as TenantQuery
          debug(`[${op}] Initial query: ${JSON.stringify(q.getQuery())}`)

          // Skip if query already has tenantId or this is a system operation
          if (!q.getQuery().tenantId && !q._skipTenantFilter) {
            const currentTenantId = getCurrentTenantId()
            if (currentTenantId) {
              debug(
                `[${op}] Applying tenant filter with ID: ${currentTenantId}`,
              )
              try {
                // Keep as string since that's how it's stored in DB
                q.where({ tenantId: currentTenantId })
                debug(`[${op}] Modified query: ${JSON.stringify(q.getQuery())}`)
              } catch (err) {
                debug(
                  `[${op}] Error setting tenant filter: ${(err as Error).message}`,
                )
              }
            } else {
              debug(`[${op}] No tenant ID found in context!`)
            }
          } else {
            debug(
              `[${op}] Skipping tenant filter: query already has tenantId or _skipTenantFilter=${q._skipTenantFilter}`,
            )
          }
          next()
        },
      )
    })

    // This ensures new documents are created with the current tenant ID
    schema.pre('save', function (next) {
      const doc = this as Document & { tenantId?: string }
      if (doc.isNew && !doc.tenantId) {
        const currentTenantId = getCurrentTenantId()
        if (currentTenantId) {
          debug(`Setting tenantId ${currentTenantId} on new document`)
          doc.tenantId = currentTenantId
        }
      }
      next()
    })

    // Add static method to create documents with current tenant
    schema.statics.createWithTenant = async function (
      data: Record<string, unknown>,
    ) {
      const tenantId = getCurrentTenantId()
      if (!tenantId) {
        throw new Error('No tenant ID available in current context')
      }
      return this.create({ ...data, tenantId })
    }

    // Add static method to bypass tenant filtering when needed (admin functions)
    schema.statics.skipTenantFilter = function () {
      const query = this.find() as TenantQuery
      query._skipTenantFilter = true
      return query
    }

    // Add byTenant static method for backward compatibility
    schema.statics.byTenant = function (tenantId: string) {
      // Retain 'this' context by using a captured reference
      const self = this as Model<unknown> & {
        paginate: (query: Record<string, unknown>, options: unknown) => unknown
      }
      return {
        find(query: Record<string, unknown> = {}) {
          return self.find({ ...query, tenantId })
        },
        findOne(query: Record<string, unknown> = {}) {
          return self.findOne({ ...query, tenantId })
        },
        findById(id: unknown) {
          return self.findOne({ _id: id, tenantId })
        },
        findByIdAndUpdate(
          id: unknown,
          update: UpdateQuery<unknown>,
          options: QueryOptions<unknown>,
        ) {
          return self.findOneAndUpdate({ _id: id, tenantId }, update, options)
        },
        findOneAndUpdate(
          query: Record<string, unknown>,
          update: UpdateQuery<unknown>,
          options: QueryOptions<unknown>,
        ) {
          return self.findOneAndUpdate({ ...query, tenantId }, update, options)
        },
        findByIdAndDelete(id: unknown) {
          return self.findOneAndDelete({ _id: id, tenantId })
        },
        update(
          query: Record<string, unknown>,
          update: UpdateQuery<unknown>,
          options: QueryOptions<unknown>,
        ) {
          return self.updateMany(
            { ...query, tenantId },
            update,
            options as Parameters<typeof self.updateMany>[2],
          )
        },
        deleteMany(query: Record<string, unknown>) {
          return self.deleteMany({ ...query, tenantId })
        },
        countDocuments(query: Record<string, unknown> = {}) {
          return self.countDocuments({ ...query, tenantId })
        },
        create(data: Record<string, unknown>) {
          return self.create({ ...data, tenantId })
        },
        // The paginate method comes from the pagination plugin
        paginate(query: Record<string, unknown> = {}, options: unknown = {}) {
          debug(
            `Paginating with tenantId ${tenantId}, query: ${JSON.stringify(query)}, options: ${JSON.stringify(options)}`,
          )
          return self.paginate({ ...query, tenantId }, options)
        },
      }
    }
  }
}

// Exported for use elsewhere even though it is not referenced internally.
export { getTenantId }
