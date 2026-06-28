// Set timeout for all tests to handle async operations
jest.setTimeout(30000) // 30 seconds

// Global teardown - will be executed after all tests
afterAll(async () => {
  // Add global cleanup here if needed
})
