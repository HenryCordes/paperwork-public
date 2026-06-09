import {
  redact,
  createControllerLogger,
  createModelLogger,
  createServiceLogger,
  logOperation,
  logOperationSuccess,
  logOperationError,
} from '../../../services/logger/utils'

const fakeLogger = () => ({ info: jest.fn(), error: jest.fn() })

describe('logger factories', () => {
  it('createControllerLogger returns a logger with info/error', () => {
    const log = createControllerLogger('contacts')
    expect(typeof log.info).toBe('function')
    expect(typeof log.error).toBe('function')
  })

  it('createModelLogger returns a logger with info/error', () => {
    const log = createModelLogger('Contact')
    expect(typeof log.info).toBe('function')
    expect(typeof log.error).toBe('function')
  })

  it('createServiceLogger returns a logger with info/error', () => {
    const log = createServiceLogger('exportService')
    expect(typeof log.info).toBe('function')
    expect(typeof log.error).toBe('function')
  })
})

describe('logOperation helpers', () => {
  it('logs the start with redacted params', () => {
    const log = fakeLogger()
    logOperation(log, 'createUser', { email: 'a@b.c', password: 'secret' })

    expect(log.info).toHaveBeenCalledWith(
      'Operation started: createUser',
      expect.objectContaining({
        operation: 'createUser',
        flowState: 'start',
        params: { email: 'a@b.c', password: '[REDACTED]' },
      }),
    )
  })

  it('logs success with redacted result', () => {
    const log = fakeLogger()
    logOperationSuccess(log, 'createUser', { id: 'u1', token: 'jwt' })

    expect(log.info).toHaveBeenCalledWith(
      'Operation completed: createUser',
      expect.objectContaining({
        operation: 'createUser',
        flowState: 'complete',
        result: { id: 'u1', token: '[REDACTED]' },
      }),
    )
  })

  it('logs failure with the error message and name', () => {
    const log = fakeLogger()
    logOperationError(log, 'createUser', new Error('boom'))

    expect(log.error).toHaveBeenCalledWith(
      'Operation failed: createUser',
      expect.objectContaining({
        operation: 'createUser',
        error: expect.objectContaining({ message: 'boom', name: 'Error' }),
      }),
    )
  })
})

describe('redact', () => {
  it('replaces each sensitive top-level field and leaves the rest intact', () => {
    const result = redact({
      password: 'hunter2',
      token: 'jwt-abc',
      secret: 's3cr3t',
      key: 'k123',
      apiKey: 'api-789',
      userId: 'u1',
      email: 'jan@example.com',
    })

    expect(result.password).toBe('[REDACTED]')
    expect(result.token).toBe('[REDACTED]')
    expect(result.secret).toBe('[REDACTED]')
    expect(result.key).toBe('[REDACTED]')
    expect(result.apiKey).toBe('[REDACTED]')
    expect(result.userId).toBe('u1')
    expect(result.email).toBe('jan@example.com')
  })

  it('does not mutate the source object', () => {
    const source = { password: 'hunter2', userId: 'u1' }
    redact(source)
    expect(source.password).toBe('hunter2')
  })

  it('returns an equal object when no sensitive fields are present', () => {
    const source = { userId: 'u1', amount: 42 }
    expect(redact(source)).toEqual({ userId: 'u1', amount: 42 })
  })

  it('does not recurse into nested objects (shallow redaction only)', () => {
    const result = redact({ user: { password: 'hunter2' } })
    expect((result.user as { password: string }).password).toBe('hunter2')
  })
})
