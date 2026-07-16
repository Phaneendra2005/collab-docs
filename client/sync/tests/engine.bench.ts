import { bench, describe } from 'vitest'
import { OperationEngine } from '../operation-engine'
import { DocumentOperation } from '../types'

describe('OperationEngine Benchmarks', () => {
  const generateOps = (count: number): DocumentOperation[] => {
    return Array.from({ length: count }, (_, i) => ({
      operationId: `op${i}`,
      actorId: 'bench-actor',
      documentId: 'doc1',
      lamportClock: i,
      parentOperationIds: i === 0 ? [] : [`op${i - 1}`],
      documentVersion: 1,
      schemaVersion: 1,
      operationType: 'InsertText',
      payload: { blockId: 'b1', index: 0, text: 'a' },
      checksum: 'hash',
      operationHash: 'hash',
      createdAt: Date.now(),
    }))
  }

  const ops10k = generateOps(10000)
  const ops50k = generateOps(50000)
  const ops100k = generateOps(100000)

  bench('Replay 10,000 Operations', () => {
    const engine = new OperationEngine('doc1')
    for (const op of ops10k) {
      engine.receiveOperation(op)
    }
  })

  bench('Replay 50,000 Operations', () => {
    const engine = new OperationEngine('doc1')
    for (const op of ops50k) {
      engine.receiveOperation(op)
    }
  })

  bench('Replay 100,000 Operations', () => {
    const engine = new OperationEngine('doc1')
    for (const op of ops100k) {
      engine.receiveOperation(op)
    }
  })
})
