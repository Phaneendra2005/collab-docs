import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OperationEngine } from '../operation-engine'
import { DocumentOperation } from '../types'

vi.mock('../hash', () => ({
  hashOperation: vi.fn(async (op: any) => {
    return op.operationHash || 'mock-hash'
  }),
}))

describe('OperationEngine - CRDT Determinism', () => {
  const createMockOp = (
    lamport: number,
    actor: string,
    parents: string[],
    id: string,
  ): DocumentOperation => {
    return {
      operationId: id,
      actorId: actor,
      documentId: 'doc1',
      lamportClock: lamport,
      parentOperationIds: parents,
      documentVersion: 1,
      schemaVersion: 1,
      operationType: 'InsertText',
      payload: { blockId: 'mock-block', text: 'a', index: 0 },
      checksum: 'fake-checksum',
      operationHash: 'mock-hash',
      createdAt: Date.now(),
    }
  }

  it('Applies operations in Lamport order with Actor tie-breaking', async () => {
    const engine = new OperationEngine('doc1')

    const op1 = createMockOp(1, 'alice', [], 'op1')
    const op2 = createMockOp(1, 'bob', [], 'op2') // Tie on lamport
    const op3 = createMockOp(2, 'alice', ['op1', 'op2'], 'op3') // Dependent

    const res1 = await engine.receiveOperation(op1)
    const res2 = await engine.receiveOperation(op3) // Buffered
    const res3 = await engine.receiveOperation(op2) // Unlocks op3

    expect(res1.length).toBe(1)
    expect(res2.length).toBe(0)
    expect(res3.length).toBe(2) // op2 + op3

    expect(res3[0].operationId).toBe('op2')
    expect(res3[1].operationId).toBe('op3')
  })

  it('Causal Buffering buffers operations with missing parents', async () => {
    const engine = new OperationEngine('doc1')

    const op1 = createMockOp(1, 'alice', [], 'op1')
    const op2 = createMockOp(2, 'alice', ['op1'], 'op2')

    // Receive op2 first (Out of order delivery)
    const res1 = await engine.receiveOperation(op2)
    expect(res1.length).toBe(0) // Buffered
    expect(engine.getBufferedCount()).toBe(1)

    // Receive op1 later
    const res2 = await engine.receiveOperation(op1)
    expect(res2.length).toBe(2) // op1 applied, unlocks op2
    expect(res2[0].operationId).toBe('op1')
    expect(res2[1].operationId).toBe('op2')
    expect(engine.getBufferedCount()).toBe(0)
  })

  it('Ignores duplicate operations', async () => {
    const engine = new OperationEngine('doc1')
    const op1 = createMockOp(1, 'alice', [], 'op1')

    await engine.receiveOperation(op1)
    const dupRes = await engine.receiveOperation(op1)

    expect(dupRes.length).toBe(0)
  })
})
