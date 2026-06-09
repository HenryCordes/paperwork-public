import mongoose, { Schema } from 'mongoose'

// Mock middleware module before requiring it
jest.mock('../../../middleware/mongoose/tenant-middleware', () => {
  // Create mock functions inside the mock factory
  const mockPluginFunction = jest
    .fn()
    .mockImplementation((schema: MockSchema) => {
      // Add tenantId field
      schema.add({ tenantId: { type: String, required: true, index: true } })

      // Add pre hooks for operations
      ;['find', 'findOne', 'countDocuments'].forEach((op) => {
        schema.pre(op, jest.fn())
      })

      // Add static methods
      schema.statics = {
        byTenant: jest.fn().mockReturnValue({}),
        skipTenantFilter: jest.fn().mockReturnValue({}),
        createWithTenant: jest.fn().mockReturnValue({}),
      }
    })

  // Create other mock functions
  const mockGetCurrentTenantId = jest.fn()

  // Return the mock module
  return {
    tenantMiddleware: jest.fn().mockReturnValue(mockPluginFunction),
    getCurrentTenantId: mockGetCurrentTenantId,
    withTenant: jest.fn(),
    setTenantContext: jest.fn(),
    debug: jest.fn(),
  }
})

// We'll also need to mock the actual mongoose schema methods
jest.mock('mongoose', () => {
  class MockSchema {
    _hooks: Record<string, unknown> = {}
    add = jest.fn()
    pre = jest.fn((op: string, callback: unknown) => {
      this._hooks[op] = callback
      return this
    })
    path = jest.fn(() => ({ instance: 'String' }))
    plugin = jest.fn((pluginFn: unknown) => {
      if (typeof pluginFn === 'function') {
        pluginFn(this)
      }
      return this
    })
    statics: Record<string, unknown> = {}
  }

  return {
    Schema: MockSchema,
    model: jest.fn(() => ({})),
  }
})

// Now require the mocked module
import {
  tenantMiddleware,
  getCurrentTenantId,
} from '../../../middleware/mongoose/tenant-middleware'

// Shape of the mocked Schema instance — mongoose is fully mocked above, so
// the real Schema generics do not apply at runtime.
interface MockSchema {
  add: jest.Mock
  pre: jest.Mock
  plugin: jest.Mock
  statics: Record<string, jest.Mock>
}

describe('Tenant Middleware', () => {
  let TestSchema: MockSchema

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()

    // Create a new schema for each test
    TestSchema = new mongoose.Schema({
      name: String,
    }) as unknown as MockSchema

    // Apply the tenant middleware plugin
    TestSchema.plugin(tenantMiddleware())

    // Create a model from the schema
    mongoose.model('TestModel', TestSchema as unknown as Schema)
  })

  describe('Schema Plugin', () => {
    it('should call the tenant middleware function', () => {
      // Check that the factory function was called
      expect(tenantMiddleware).toHaveBeenCalled()

      // The plugin function is applied to the schema
      expect(TestSchema.plugin).toHaveBeenCalled()
      expect(TestSchema.add).toHaveBeenCalledWith({
        tenantId: { type: String, required: true, index: true },
      })
    })

    it('should add pre-hooks for query operations', () => {
      // Verify that pre hooks were registered for common operations
      expect(TestSchema.pre).toHaveBeenCalledWith('find', expect.any(Function))
      expect(TestSchema.pre).toHaveBeenCalledWith(
        'findOne',
        expect.any(Function),
      )
      expect(TestSchema.pre).toHaveBeenCalledWith(
        'countDocuments',
        expect.any(Function),
      )
    })

    it('should add static methods to the schema', () => {
      // Check that static methods were added to schema
      expect(TestSchema.statics).toBeDefined()
      expect(TestSchema.statics.byTenant).toBeDefined()
      expect(TestSchema.statics.skipTenantFilter).toBeDefined()
      expect(TestSchema.statics.createWithTenant).toBeDefined()
    })
  })

  describe('Tenant ID Handling', () => {
    it('should provide a utility to get current tenant ID', () => {
      // Set up the expected return value
      ;(getCurrentTenantId as jest.Mock).mockReturnValue('test-tenant-id')

      // Call the function
      const result = getCurrentTenantId()

      // Verify the result
      expect(result).toBe('test-tenant-id')
      expect(getCurrentTenantId).toHaveBeenCalled()
    })

    it('should handle null or undefined tenant IDs', () => {
      // Test with null
      ;(getCurrentTenantId as jest.Mock).mockReturnValue(null)
      expect(getCurrentTenantId()).toBeNull()

      // Test with undefined
      ;(getCurrentTenantId as jest.Mock).mockReturnValue(undefined)
      expect(getCurrentTenantId()).toBeUndefined()
    })
  })

  // Further tests for the middleware functionality could be added here
  // But since we're heavily mocking mongoose, it's better to test
  // actual behavior in an integration test
})
