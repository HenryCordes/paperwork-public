import { Request, Response } from 'express'

import { availablePlans } from '../common/plans'
import asyncHandlers from '../middleware/async'

// @desc    Get all subscription plans
// @route   GET /api/plans
// @access  Public
export const getPlans = asyncHandlers(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: availablePlans,
  })
})
