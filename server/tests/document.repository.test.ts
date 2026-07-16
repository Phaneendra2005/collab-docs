import { expect, test, vi } from 'vitest'
import { PrismaDocumentRepository } from '../repositories/document.repository'

test('PrismaDocumentRepository.create creates a document', async () => {
  const repo = new PrismaDocumentRepository()
  const mockData = { title: 'Test', slug: 'test', ownerId: 'user1' }

  const mockTx = {
    document: {
      create: vi.fn().mockResolvedValue({ id: 'doc1', ...mockData }),
    },
  }

  const result = await repo.create(mockData, mockTx as any)

  expect(mockTx.document.create).toHaveBeenCalledWith({ data: mockData })
  expect(result.id).toBe('doc1')
})
