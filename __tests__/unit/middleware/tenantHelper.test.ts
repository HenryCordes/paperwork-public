// Import the required modules, but mock cls-hooked first
jest.mock('cls-hooked', () => {
  // Define mocks inside the mock factory function to avoid referencing external variables
  const mockNamespace = {
    get: jest.fn(),
    set: jest.fn(),
    bindEmitter: jest.fn(),
    run: jest.fn((callback: () => unknown) => callback()),
  }

  return {
    createNamespace: jest.fn(() => mockNamespace),
    getNamespace: jest.fn(() => mockNamespace),
  }
})

// Import functions to test AFTER mocking cls-hooked
import { getNamespace } from 'cls-hooked'

import {
  getCurrentTenantId,
  setCurrentTenantId,
} from '../../../middleware/tenantHelper'

describe('Tenant Helper', () => {
  // Get a reference to our mocked namespace after mocking is applied
  const mockNamespace = getNamespace('request')

  // Clear all mocks after each test
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getCurrentTenantId', () => {
    it('should return tenant ID from CLS namespace when available', () => {
      // Mock the CLS namespace to return a tenant ID
      mockNamespace.get.mockReturnValueOnce('tenant-from-cls')

      const result = getCurrentTenantId()

      expect(mockNamespace.get).toHaveBeenCalledWith('tenantId')
      expect(result).toBe('tenant-from-cls')
    })

    it('should return tenant ID from parameter when CLS namespace is empty', () => {
      // Mock the CLS namespace to return null (no tenant ID set)
      mockNamespace.get.mockReturnValueOnce(null)

      const result = getCurrentTenantId('tenant-from-param')

      expect(mockNamespace.get).toHaveBeenCalledWith('tenantId')
      expect(result).toBe('tenant-from-param')
    })

    it('should return undefined when no tenant ID is available anywhere', () => {
      // Mock all gets to return null
      mockNamespace.get.mockReturnValue(null)

      const result = getCurrentTenantId()

      expect(mockNamespace.get).toHaveBeenCalledWith('tenantId')
      expect(result).toBeUndefined()
    })
  })

  describe('setCurrentTenantId', () => {
    it('should set tenant ID in the CLS namespace', () => {
      setCurrentTenantId('new-tenant-id')

      expect(mockNamespace.set).toHaveBeenCalledWith(
        'tenantId',
        'new-tenant-id',
      )
    })
  })
})
