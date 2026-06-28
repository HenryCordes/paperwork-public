// Shared domain and API types, consumed by both backend and client via the
// "@shared/*" path alias. Keep this runtime-free (types only).

/** Organization/tenant identifier (Mongo ObjectId as string). */
export type TenantId = string

/** Period preset keys, mirroring common/constants/periodPresets.js values. */
export type PeriodPreset =
  | 'last-month'
  | 'last-3-months'
  | 'last-12-months'
  | 'this-year'
  | 'last-year'
  | 'custom'

/** Standard successful API envelope. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

/** Standard error API envelope. */
export interface ApiError {
  success: false
  error: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
