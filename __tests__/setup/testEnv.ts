// __tests__/setup/testEnv.ts
// Runs before every test file. The app reads JWT_SECRET at request time;
// set a deterministic value so minted tokens verify.
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'
process.env.JWT_EXPIRES = '1h'
