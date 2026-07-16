import { expect, test, vi } from 'vitest'
import { createPermissionService } from '../services/permission.service'
import { Role } from '@prisma/client'

test('PermissionService allows OWNER to edit', async () => {
  const mockDocRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'doc1', ownerId: 'user1' }),
  } as any
  const mockCollabRepo = {
    findByUserAndDocument: vi.fn().mockResolvedValue(null),
  } as any

  const service = createPermissionService({
    documentRepo: mockDocRepo,
    collaboratorRepo: mockCollabRepo,
  })

  const canEdit = await service.canEditDocument('user1', 'doc1')
  expect(canEdit).toBe(true)
})

test('PermissionService allows EDITOR to edit', async () => {
  const mockDocRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'doc1', ownerId: 'owner1' }),
  } as any
  const mockCollabRepo = {
    findByUserAndDocument: vi.fn().mockResolvedValue({ role: Role.EDITOR }),
  } as any

  const service = createPermissionService({
    documentRepo: mockDocRepo,
    collaboratorRepo: mockCollabRepo,
  })

  const canEdit = await service.canEditDocument('editor1', 'doc1')
  expect(canEdit).toBe(true)
})

test('PermissionService denies VIEWER to edit', async () => {
  const mockDocRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'doc1', ownerId: 'owner1' }),
  } as any
  const mockCollabRepo = {
    findByUserAndDocument: vi.fn().mockResolvedValue({ role: Role.VIEWER }),
  } as any

  const service = createPermissionService({
    documentRepo: mockDocRepo,
    collaboratorRepo: mockCollabRepo,
  })

  const canEdit = await service.canEditDocument('viewer1', 'doc1')
  expect(canEdit).toBe(false)
})
