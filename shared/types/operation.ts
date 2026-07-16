import { z } from 'zod'

export type OperationType =
  | 'InsertText'
  | 'DeleteText'
  | 'FormatText'
  | 'SplitBlock'
  | 'MergeBlock'
  | 'InsertNode'
  | 'DeleteNode'
  | 'UpdateMetadata'

export interface BaseOperation {
  operationId: string
  actorId: string
  documentId: string
  lamportClock: number
  parentOperationIds: string[]
  documentVersion: number
  checksum: string
  operationHash: string
  createdAt: number
  schemaVersion: number
}

export interface InsertTextOperation extends BaseOperation {
  operationType: 'InsertText'
  payload: {
    blockId: string
    index: number
    text: string
  }
}

export interface DeleteTextOperation extends BaseOperation {
  operationType: 'DeleteText'
  payload: {
    blockId: string
    index: number
    length: number
  }
}

export interface FormatTextOperation extends BaseOperation {
  operationType: 'FormatText'
  payload: {
    blockId: string
    index: number
    length: number
    format: Record<string, string | boolean | number>
  }
}

export interface SplitBlockOperation extends BaseOperation {
  operationType: 'SplitBlock'
  payload: {
    blockId: string
    index: number
    newBlockId: string
  }
}

export interface MergeBlockOperation extends BaseOperation {
  operationType: 'MergeBlock'
  payload: {
    targetBlockId: string
    sourceBlockId: string
  }
}

export interface InsertNodeOperation extends BaseOperation {
  operationType: 'InsertNode'
  payload: {
    nodeId: string
    parentId: string | null
    index: number
    nodeType: string
    data?: Record<string, string | boolean | number>
  }
}

export interface DeleteNodeOperation extends BaseOperation {
  operationType: 'DeleteNode'
  payload: {
    nodeId: string
  }
}

export interface UpdateMetadataOperation extends BaseOperation {
  operationType: 'UpdateMetadata'
  payload: {
    key: string
    value: string | number | boolean | null
  }
}

export type DocumentOperation =
  | InsertTextOperation
  | DeleteTextOperation
  | FormatTextOperation
  | SplitBlockOperation
  | MergeBlockOperation
  | InsertNodeOperation
  | DeleteNodeOperation
  | UpdateMetadataOperation

export const BaseOperationSchema = z.object({
  operationId: z.string(),
  actorId: z.string(),
  documentId: z.string(),
  lamportClock: z.number(),
  parentOperationIds: z.array(z.string()),
  documentVersion: z.number(),
  checksum: z.string(),
  operationHash: z.string(),
  createdAt: z.number(),
  schemaVersion: z.number(),
})

export const DocumentOperationSchema = z.union([
  BaseOperationSchema.extend({
    operationType: z.literal('InsertText'),
    payload: z.object({
      blockId: z.string(),
      index: z.number(),
      text: z.string(),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('DeleteText'),
    payload: z.object({
      blockId: z.string(),
      index: z.number(),
      length: z.number(),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('FormatText'),
    payload: z.object({
      blockId: z.string(),
      index: z.number(),
      length: z.number(),
      format: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('SplitBlock'),
    payload: z.object({
      blockId: z.string(),
      index: z.number(),
      newBlockId: z.string(),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('MergeBlock'),
    payload: z.object({
      targetBlockId: z.string(),
      sourceBlockId: z.string(),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('InsertNode'),
    payload: z.object({
      nodeId: z.string(),
      parentId: z.string().nullable(),
      index: z.number(),
      nodeType: z.string(),
      data: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('DeleteNode'),
    payload: z.object({
      nodeId: z.string(),
    }),
  }),
  BaseOperationSchema.extend({
    operationType: z.literal('UpdateMetadata'),
    payload: z.object({
      key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }),
  }),
])
