import {
  getDocument,
  updateDocument,
  deleteDocument,
} from '../../../../server/controllers/document.controller'
import { apiHandler } from '../../../../server/middlewares/api-handler'

export const GET = apiHandler(getDocument)
export const PATCH = apiHandler(updateDocument)
export const DELETE = apiHandler(deleteDocument)
