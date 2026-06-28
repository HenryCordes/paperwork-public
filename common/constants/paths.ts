/**
 * Path constants for consistent directory references
 * These are used across the server-side code for temp files, exports, etc.
 */

import path from 'path'

export const PATHS = {
  TEMP_DIR: path.join(process.cwd(), 'tmp/temp'),
} as const
