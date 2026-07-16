import { z } from 'zod'

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(100).optional().default('Untitled'),
  icon: z.string().optional(),
  coverImage: z.string().url().optional(),
})

export type CreateDocumentDTO = z.infer<typeof CreateDocumentSchema>

export const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  icon: z.string().nullable().optional(),
  coverImage: z.string().url().nullable().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
})

export type UpdateDocumentDTO = z.infer<typeof UpdateDocumentSchema>

export const DocumentQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  search: z.string().optional(),
  sort: z.enum(['updatedAt', 'createdAt', 'title']).default('updatedAt'),
  filter: z.enum(['all', 'owner', 'shared', 'favorite', 'archived']).default('all'),
})

export type DocumentQueryDTO = z.infer<typeof DocumentQuerySchema>
