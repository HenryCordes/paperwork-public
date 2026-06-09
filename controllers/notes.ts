import { Request, Response, NextFunction } from 'express'
import _ from 'lodash'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Note from '../models/Note'
import User from '../models/User'

// @Method: GET
// @Route : api/notes
// @Desc  : Get all notes
export const getNotes = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offset } = req.query
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantNote = Note.byTenant(tenantId)
      const notes = await tenantNote.paginate(
        {},
        {
          offset: Number(offset) || 0,
          limit: 10,
          lean: true,
          sort: { createdAt: -1 },
        },
      )

      return res.status(200).json({ success: true, data: notes })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/note
// @Desc  : Create a new note
export const createOrUpdateNote = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = _.pick(req.body, [
      '_id',
      'owner',
      'noteDate',
      'description',
      'contactId',
      'contactName',
    ])

    console.log(data)
    if (!data.description || !data.noteDate) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantNote = Note.byTenant(tenantId)
      let note

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        note = await tenantNote
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        const user = await User.findById(req.user?.id).lean().exec()
        data.owner = user!._id
        note = await tenantNote.create(data)
      }
      res.status(200).json({ success: true, data: note })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/note
// @Desc  : get a note
export const getNote = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantNote = Note.byTenant(tenantId)
      const note = await tenantNote.findById(req.params.id).lean().exec()

      if (!note) {
        return res
          .status(404)
          .json({ success: false, message: 'Note not found..' })
      }
      res.status(200).json({ success: true, data: note })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: DELETE
// @Route : api/note/:id
// @Desc  : deletes an note
export const deleteNote = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('trying to delete note')
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantNote = Note.byTenant(tenantId)
      const note = await tenantNote
        .findByIdAndDelete(req.params.id)
        .lean()
        .exec()

      if (!note) {
        return res
          .status(404)
          .json({ success: false, message: 'Note not found..' })
      }
      res.status(200).json({ success: true, data: note })
    } catch (error) {
      return next(error)
    }
  },
)
