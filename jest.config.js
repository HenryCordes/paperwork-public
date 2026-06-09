module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.[jt]s', '**/?(*.)+(spec|test).[jt]s'],
  testPathIgnorePatterns: ['/node_modules/', '/client/', '/__tests__/setup/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  setupFiles: [
    '<rootDir>/__tests__/setup/testEnv.ts',
    '<rootDir>/__tests__/setup/externalMocks.ts',
  ],
  setupFilesAfterEnv: ['./jest.setup.js'],
  // Integration suites import the full app (queues, schedulers). Force exit so a
  // lingering framework handle can never hang CI after the run completes.
  forceExit: true,
  // Each integration file boots its own mongodb-memory-server. Cap parallelism
  // so many concurrent in-memory mongods don't contend and intermittently time
  // out a request on high-core machines. (CI is ~2 cores, so this matches it.)
  // Longer-term fix: share one server across files instead of one-per-file.
  maxWorkers: 2,
  collectCoverage: true,
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  // Server coverage gate (see specs/2026-06-09-coverage-thresholds/design.md).
  // Reached after the controller + service test campaign; enforced as a
  // regression floor. The original ww-marketing-website Node profile (90/85/90)
  // didn't fit this server (real-PDF rendering, queue/S3 glue, defensive guards);
  // 75/75/75/60 reflects meaningful behavioral coverage of every controller and
  // service. Raise as coverage grows.
  coverageThreshold: {
    global: {
      lines: 75,
      statements: 75,
      functions: 75,
      branches: 60,
    },
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/client/',
    '/coverage/',
    '/__tests__/',
  ],
  verbose: true,
}
