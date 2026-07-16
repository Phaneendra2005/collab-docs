# ADR 001: CRDT Selection & Sync Algorithm

## Context

Building a robust collaborative document editor requires conflict-free resolution when multiple clients edit concurrently, especially in offline-first scenarios.

## Decision

We implemented a custom operation-based CRDT instead of adopting a heavy pre-built library like Yjs or Automerge.
The CRDT uses **Lamport Timestamps**, **Actor IDs**, and **Causal Dependency Tracking (Parent IDs)** to deterministically sort and apply operations.

## Consequences

- **Pros:** Full control over payload size, deep integration with our IndexedDB offline queue, reduced bundle size, and easy database syncing.
- **Cons:** We are responsible for maintaining and testing the deterministic merge logic and ensuring causality buffers correctly apply operations once dependencies are met.
