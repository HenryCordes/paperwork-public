import { Request, Response, NextFunction } from 'express'
import _ from 'lodash'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Settings from '../models/Settings'

// @Method: GET
// @Route : api/settings
// @Desc  : Get the settings for this tenant
export const getSettings = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantSettings = Settings.byTenant(tenantId)
      const settings = await tenantSettings.findOne({}).lean().exec()

      return res.status(200).json({ success: true, data: settings })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/settings
// @Desc  : Create or update a settings document
export const createOrUpdateSettings = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = _.pick(req.body, [
      '_id',
      'companyName',
      'street',
      'houseNumber',
      'postalCode',
      'city',
      'country',
      'phoneNumber',
      'companyEmail',
      'taxNumber',
      'chamberOfCommerceNumber',
      'bankName',
      'bankIBAN',
      'registerNumber',
      'agbCode',
      'website',
      'companyLogo',
      'currency',
    ])

    if (
      !data.companyName ||
      !data.street ||
      !data.houseNumber ||
      !data.postalCode ||
      !data.city ||
      !data.country ||
      !data.phoneNumber ||
      !data.companyEmail ||
      !data.taxNumber ||
      !data.chamberOfCommerceNumber ||
      !data.bankName ||
      !data.bankIBAN
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantSettings = Settings.byTenant(tenantId)
      let settings

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        settings = await tenantSettings
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        settings = await tenantSettings.create(data)
      }
      res.status(200).json({ success: true, data: settings })
    } catch (error) {
      return next(error)
    }
  },
)
