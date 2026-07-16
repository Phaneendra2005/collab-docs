import { createMention } from '../../../../../server/controllers/mention.controller'
import { apiHandler } from '../../../../../server/middlewares/api-handler'

export const POST = apiHandler(createMention)
