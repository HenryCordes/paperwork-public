// Side-effect module: load environment variables before any other module
// (queue/redis config reads process.env at import time). Import this FIRST in
// the process entrypoints so ES import hoisting doesn't run env-dependent
// module bodies before dotenv has populated process.env.
import dotenv from 'dotenv'

dotenv.config({ path: './config/config.env' })
