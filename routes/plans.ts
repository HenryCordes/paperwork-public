import express from 'express'

import { getPlans } from '../controllers/plans'

const router = express.Router()

router.route('/').get(getPlans)

export = router
