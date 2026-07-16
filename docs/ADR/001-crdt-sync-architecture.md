# Architecture Decision Record: Synchronization Engine

## 1. Context

We need a highly reliable, local-first synchronization engine to support multi-user real-time document editing, with full offline capabilities and strict deterministic consistency across all clients.

## 2. Decision: Lamport Clocks over Vector Clocks

### Why Lamport Clocks?

- **Vector Clock Limitations:** Vector clocks require storing the state of _every_ actor who has ever modified the document. In a public or highly collaborative document with thousands of unique historical viewers/editors, the vector clock size grows linearly `O(A)` where `A` is the number of actors. This bloats payload sizes unacceptably.
- **Lamport Clock Advantages:** Lamport clocks are a single scalar integer. They ensure causal ordering without scaling based on the number of collaborators. We use Actor IDs strictly for lexicographical tie-breaking when two operations share the exact same Lamport timestamp.

## 3. Decision: Custom CRDT over Yjs or Automerge

### Why a Custom CRDT?

While Yjs and Automerge are fantastic general-purpose CRDTs, we chose a custom implementation for the following production reasons:

- **Strict Role-Based Access Control (RBAC):** We need to enforce permission models at the _operation level_ in real-time. Native integration with our backend services allows us to reject specific operations if a user's permissions are revoked mid-session, which is harder to orchestrate inside an opaque binary blob like Yjs.
- **Auditability:** We require cryptographic hashing (SHA-256) and checksum verification of every operation payload for compliance and security.
- **Payload Visibility:** Our custom JSON-based operations (`InsertText`, `FormatText`) are fully readable and directly parseable by our Next.js backend, allowing edge middleware to intercept and validate changes dynamically.

### Trade-offs & Limitations

- **Manual Compaction Required:** Unlike Yjs which deeply optimizes binary encoding, our custom operation log grows rapidly in JSON form. We mitigate this via our **Adaptive Snapshot Strategy**, flattening state when log sizes exceed 5MB.
- **Memory Overhead:** A custom causal buffer in memory uses more RAM than optimized C++/Wasm structures.

## 4. Future Scaling

To handle 10,000+ concurrent connections on a single document, we will introduce:

- **Operation Chunking:** Aggregating thousands of micro-operations into a macro-operation (e.g. stringing 100 character inserts into 1 string insert) before enqueuing to the background worker.
- **Redis Pub/Sub:** Decoupling the WebSocket termination layer from the database write layer, fanning out operations purely in memory for viewers.
