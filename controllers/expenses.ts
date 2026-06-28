import { Request, Response, NextFunction } from 'express'
import _ from 'lodash'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Expense from '../models/Expense'
import { refreshMonthFromRawData } from '../services/dashboardAggregation'

// @Method: GET
// @Route : api/expenses
// @Desc  : Get all expenses
export const getExpenses = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offset, startDate, endDate, search } = req.query
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantExpense = Expense.byTenant(tenantId)

      // Build query object for filtering
      const query: Record<string, unknown> = {}

      // Add date range filtering if startDate and endDate are provided
      if (startDate && endDate) {
        query.expenseDate = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string),
        }
      }

      // Add search filtering if search parameter is provided
      if (search) {
        // Build search query - handle numeric and string fields separately
        const searchConditions: Record<string, unknown>[] = []

        // For text fields, use regex search
        searchConditions.push(
          { info: { $regex: search, $options: 'i' } },
          { contactName: { $regex: search, $options: 'i' } },
        )

        // For expenseNumber, which is numeric, only add if search is a number
        const numberSearch = Number(String(search).trim())
        if (!isNaN(numberSearch)) {
          searchConditions.push({ expenseNumber: numberSearch })
        }

        // Add conditions to query
        if (searchConditions.length > 0) {
          query.$or = searchConditions
        }
      }

      const expenses = await tenantExpense.paginate(query, {
        offset: Number(offset) || 0,
        limit: 10,
        lean: true,
        sort: { expenseDate: -1 },
      })
      return res.status(200).json({ success: true, data: expenses })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/expense
// @Desc  : get an expense
export const getExpense = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantExpense = Expense.byTenant(tenantId)
      const expense = await tenantExpense.findById(req.params.id).lean().exec()

      if (!expense) {
        return res
          .status(404)
          .json({ success: false, message: 'Expense not found..' })
      }
      res.status(200).json({ success: true, data: expense })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/expense
// @Desc  : Updates an expense, or creates a new expense
export const createOrUpdateExpense = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = _.pick(req.body, [
      '_id',
      'contactId',
      'contactName',
      'expenseNumber',
      'expenseDate',
      'info',
      'tax',
      'taxLow',
      'priceWOTaxes',
      'price',
      'expenseFile',
    ])
    console.log(data)
    if (!data.price || !data.expenseDate) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantExpense = Expense.byTenant(tenantId)
      let expense
      let previousExpenseDate: Date | undefined

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        const existingExpense = await tenantExpense
          .findById(data._id)
          .lean()
          .exec()
        previousExpenseDate = existingExpense
          ? new Date(existingExpense.expenseDate)
          : undefined
        expense = await tenantExpense
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        expense = await tenantExpense.create(data)
      }

      // Refresh entire month's dashboard aggregation to ensure completeness.
      // If the expense's date changed, the old month must also be refreshed -
      // otherwise it stays counted in both the old and new month forever.
      try {
        const expenseDate = new Date(expense!.expenseDate)
        const year = expenseDate.getFullYear()
        const month = expenseDate.getMonth() + 1

        if (
          previousExpenseDate &&
          (previousExpenseDate.getFullYear() !== year ||
            previousExpenseDate.getMonth() + 1 !== month)
        ) {
          await refreshMonthFromRawData(
            tenantId,
            previousExpenseDate.getFullYear(),
            previousExpenseDate.getMonth() + 1,
          )
        }

        await refreshMonthFromRawData(tenantId, year, month)
      } catch (aggError) {
        console.error('Failed to refresh dashboard aggregation:', aggError)
      }

      res.status(200).json({ success: true, data: expense })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: DELETE
// @Route : api/expense/:id
// @Desc  : deletes an expense
export const deleteExpense = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantExpense = Expense.byTenant(tenantId)
      const expense = await tenantExpense
        .findByIdAndDelete(req.params.id)
        .lean()
        .exec()

      if (!expense) {
        return res
          .status(404)
          .json({ success: false, message: 'Expense not found..' })
      }

      // Refresh entire month's dashboard aggregation to ensure completeness
      try {
        const expenseDate = new Date(expense.expenseDate)
        const year = expenseDate.getFullYear()
        const month = expenseDate.getMonth() + 1
        await refreshMonthFromRawData(tenantId, year, month)
      } catch (aggError) {
        console.error('Failed to refresh dashboard aggregation:', aggError)
      }

      res.status(200).json({ success: true, data: expense })
    } catch (error) {
      return next(error)
    }
  },
)
