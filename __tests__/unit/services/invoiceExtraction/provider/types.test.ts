import { getProviderErrorStatus } from '../../../../../services/invoiceExtraction/provider/types'

describe('getProviderErrorStatus', () => {
  it('returns the numeric status when present', () => {
    expect(getProviderErrorStatus({ status: 500 })).toBe(500)
  })

  it('returns undefined when there is no status property', () => {
    expect(getProviderErrorStatus(new Error('network down'))).toBeUndefined()
  })

  it('returns undefined when status is not a number', () => {
    expect(getProviderErrorStatus({ status: 'oops' })).toBeUndefined()
  })

  it('returns undefined for non-object errors', () => {
    expect(getProviderErrorStatus('plain string error')).toBeUndefined()
  })
})
