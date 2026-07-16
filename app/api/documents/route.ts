import { createDocument, getDocuments } from '../../../server/controllers/document.controller'
import { apiHandler } from '../../../server/middlewares/api-handler'

export const GET = apiHandler(getDocuments)
export const POST = apiHandler(createDocument)
