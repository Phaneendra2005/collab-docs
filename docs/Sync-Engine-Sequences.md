# Sync Engine Sequence Diagrams

## 1. Typing (Editor -> Engine -> IndexedDB -> Queue)

```mermaid
sequenceDiagram
    actor User
    participant Editor
    participant SyncEngine
    participant OperationEngine
    participant IndexedDB
    participant SyncWorker

    User->>Editor: Types character
    Editor->>SyncEngine: emitOperation('InsertText', payload)
    SyncEngine->>LamportClock: increment()
    SyncEngine->>HashService: hashOperation()
    SyncEngine->>IndexedDB: operations.add(op)
    SyncEngine->>OperationEngine: receiveOperation(op)
    OperationEngine-->>SyncEngine: Applied
    SyncEngine->>SyncWorker: postMessage(ENQUEUE_OPERATION)
    SyncWorker->>IndexedDB: pendingQueue.add(op)
    SyncWorker-->>SyncWorker: processQueue() (Background)
    SyncEngine-->>Editor: Acknowledged locally
```

## 2. Offline Editing

```mermaid
sequenceDiagram
    actor User
    participant Window
    participant SyncEngine
    participant IndexedDB
    participant SyncWorker

    Window->>SyncEngine: offline event
    SyncEngine->>SyncEngine: handleOffline()
    Note over SyncWorker: Worker pauses processing
    User->>SyncEngine: emitOperation(...)
    SyncEngine->>IndexedDB: operations.add(op)
    SyncEngine->>SyncWorker: ENQUEUE_OPERATION
    SyncWorker->>IndexedDB: pendingQueue.add(op, status='pending')
    Note over SyncWorker: Network fails, remains 'pending'
```

## 3. Background Sync

```mermaid
sequenceDiagram
    participant SyncWorker
    participant IndexedDB
    participant Server

    SyncWorker->>SyncWorker: processQueue()
    SyncWorker->>IndexedDB: fetch 'pending' operations
    SyncWorker->>IndexedDB: batch & mark 'syncing'
    SyncWorker->>Server: POST /api/sync (compressed)
    Server-->>SyncWorker: 200 OK (Ack)
    SyncWorker->>IndexedDB: mark 'acked'
```

## 4. Reconnect

```mermaid
sequenceDiagram
    participant Window
    participant SyncEngine
    participant SyncWorker
    participant IndexedDB
    participant Server

    Window->>SyncEngine: online event
    SyncEngine->>SyncWorker: PROCESS_QUEUE
    SyncWorker->>IndexedDB: fetch 'pending' (from offline)
    SyncWorker->>Server: POST /api/sync
    Server-->>SyncWorker: 200 OK
    SyncWorker->>IndexedDB: mark 'acked'
```

## 5. Conflict Resolution & Causal Buffering

```mermaid
sequenceDiagram
    participant Server
    participant SyncWorker
    participant SyncEngine
    participant OperationEngine

    Server->>SyncWorker: Incoming Remote Ops [op1, op2, op3]
    SyncWorker->>SyncEngine: applyRemote(ops)
    SyncEngine->>OperationEngine: receiveOperation(op3)
    Note over OperationEngine: op3 depends on op2 (missing)
    OperationEngine->>OperationEngine: buffer.set(op3)
    SyncEngine->>OperationEngine: receiveOperation(op2)
    Note over OperationEngine: Parents satisfied
    OperationEngine->>OperationEngine: apply(op2)
    OperationEngine->>OperationEngine: flushBuffer(op3) -> apply(op3)
```

## 6. Snapshot Creation (Adaptive)

```mermaid
sequenceDiagram
    participant Editor
    participant SnapshotService
    participant CompressionService
    participant IndexedDB

    Editor->>SnapshotService: maybeCreateSnapshot(opCount > 1000)
    SnapshotService->>CompressionService: compress(stateJSON)
    CompressionService-->>SnapshotService: Uint8Array
    SnapshotService->>IndexedDB: snapshots.add({ data: compressed })
```

## 7. Queue Retry (Exponential Backoff)

```mermaid
sequenceDiagram
    participant SyncWorker
    participant IndexedDB
    participant Server

    SyncWorker->>Server: POST /api/sync
    Server-->>SyncWorker: 503 Unavailable
    SyncWorker->>IndexedDB: mark 'retrying', retryCount++
    Note over SyncWorker: Next processQueue() evaluates Backoff + Jitter
    SyncWorker->>SyncWorker: wait(2000ms + jitter)
    SyncWorker->>Server: POST /api/sync
    Server-->>SyncWorker: 200 OK
    SyncWorker->>IndexedDB: mark 'acked'
```

## 8. Crash Recovery

```mermaid
sequenceDiagram
    participant App Boot
    participant SyncEngine
    participant SyncWorker
    participant IndexedDB

    App Boot->>SyncEngine: initialize()
    SyncEngine->>SyncWorker: RECOVER_STUCK
    SyncWorker->>IndexedDB: Fetch status='syncing'
    IndexedDB-->>SyncWorker: [op1, op2]
    SyncWorker->>IndexedDB: modify status='pending'
    SyncWorker->>SyncWorker: processQueue()
```
