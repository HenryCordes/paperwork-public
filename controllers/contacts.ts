import { Request, Response, NextFunction } from 'express'
import _ from 'lodash'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Contact from '../models/Contact'
import User from '../models/User'

// @Method: GET
// @Route : api/contacts
// @Desc  : Get all contacts
export const getContacts = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offset, limit } = req.query
      // Use the organization ID from the request object instead of getCurrentTenantId()
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantContact = Contact.byTenant(tenantId)

      const contacts = await tenantContact.paginate(
        {},
        {
          offset: Number(offset) || 0,
          limit: Number(limit) || 10,
          lean: true,
          sort: { companyName: 1, lastName: 1, firstName: 1 },
        },
      )

      return res.status(200).json({ success: true, data: contacts })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/contacts
// @Desc  : Get all contacts
export const getContactsByType = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const typeName = req.params.typeName
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantContact = Contact.byTenant(tenantId)
      const contacts = await tenantContact
        .find({ typeOfContact: typeName })
        .sort({ lastName: 1 })
        .lean()
        .exec()

      return res.status(200).json({ success: true, data: contacts })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/contact
// @Desc  : Create a new contact
export const createOrUpdateContact = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = _.pick(req.body, [
      '_id',
      'owner',
      'contactNumber',
      'companyName',
      'typeOfContact',
      'lastName',
      'firstName',
      'initials',
      'gender',
      'emailAddress',
      'phoneNumber',
      'mobilePhoneNumber',
      'street',
      'houseNumber',
      'postalCode',
      'city',
      'country',
      'visitingStreet',
      'visitingHouseNumber',
      'visitingPostalCode',
      'visitingCity',
      'visitingCountry',
      'bankIBAN',
      'bankPersonName',
      'channel',
      'history',
      'typeName',
    ])

    if (
      (!data.lastName && data.typeOfContact === 'Particulier') ||
      (!data.firstName && data.typeOfContact === 'Particulier') ||
      (!data.companyName && data.typeOfContact === 'Bedrijf') ||
      !data.typeOfContact ||
      !data.emailAddress ||
      !data.typeName
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantContact = Contact.byTenant(tenantId)
      let contact

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        contact = await tenantContact
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        const user = await User.findById(req.user?.id).lean().exec()
        data.owner = user!._id
        contact = await tenantContact.create(data)
      }
      res.status(200).json({ success: true, data: contact })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/contact/:id
// @Desc  : get a contact
export const getContact = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantContact = Contact.byTenant(tenantId)
      const contact = await tenantContact.findById(req.params.id).lean().exec()

      if (!contact) {
        return res
          .status(404)
          .json({ success: false, message: 'Contact not found..' })
      }
      res.status(200).json({ success: true, data: contact })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: DELETE
// @Route : api/contact/:id
// @Desc  : deletes a contact
export const deleteContact = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantContact = Contact.byTenant(tenantId)
      const contact = await tenantContact
        .findByIdAndDelete(req.params.id)
        .lean()
        .exec()

      if (!contact) {
        return res
          .status(404)
          .json({ success: false, message: 'Contact not found..' })
      }
      res.status(200).json({ success: true, data: contact })
    } catch (error) {
      return next(error)
    }
  },
)
