# Final Architecture

## System Overview

CollabDocs is a real-time collaborative document editor designed with a **Local-First** architecture. Edits are immediately persisted to IndexedDB on the client, then asynchronously synchronized through a Socket.IO transport layer to a PostgreSQL backend.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                      Browser                          │
│                                                       │
│  ┌─────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ TipTap  │──│ Operation    │──│ Dexie          │  │
│  │ Editor  │  │ Engine       │  │ (IndexedDB)    │  │
│  └────┬────┘  └──────┬───────┘  └────────────────┘  │
│       │              │                                │
│       │        ┌─────▼──────┐                        │
│       │        │ Sync Queue │                        │
│       │        └─────┬──────┘                        │
│       │              │                                │
│  ┌────▼──────────────▼──────────────────────────┐    │
│  │          Socket.IO Client                     │    │
│  │  (WebSocket transport, auto-reconnect)        │    │
│  └──────────────────┬───────────────────────────┘    │
└─────────────────────┼────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Socket.IO Server (:3001)                │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Auth       │  │ Room       │  │ Presence      │  │
│  │ Middleware │  │ Manager    │  │ Manager       │  │
│  └────────────┘  └────────────┘  └───────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Operation  │  │ Batch      │  │ Cache         │  │
│  │ Handlers   │  │ Service    │  │ Service       │  │
│  └──────┬─────┘  └────────────┘  └───────────────┘  │
│         │                                            │
│  ┌──────▼─────────────────────────────────────────┐  │
│  │    Internal Service Client (HTTP)              │  │
│  └──────┬─────────────────────────────────────────┘  │
└─────────┼────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│              Next.js Application (:3000)             │
│                                                      │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ Internal API     │  │ Public API              │  │
│  │ /api/internal/*  │  │ /api/documents/*        │  │
│  │ (Token-gated)    │  │ /api/auth/*             │  │
│  └────────┬─────────┘  └────────┬────────────────┘  │
│           │                      │                    │
│  ┌────────▼──────────────────────▼────────────────┐  │
│  │            Service Layer                       │  │
│  │  DocumentService, PermissionService, etc.      │  │
│  └────────┬───────────────────────────────────────┘  │
│           │                                           │
│  ┌────────▼───────────────────────────────────────┐  │
│  │            Repository Layer (Prisma)           │  │
│  └────────┬───────────────────────────────────────┘  │
└───────────┼──────────────────────────────────────────┘
            │
            ▼
┌─────────────────────┐   ┌──────────────────┐
│    PostgreSQL       │   │     Redis        │
│  (Primary Store)    │   │  (Pub/Sub,       │
│                     │   │   Socket Adapter)│
└─────────────────────┘   └──────────────────┘
```

## Key Design Decisions

### 1. Local-First with CRDT

All edits are immediately applied to the local TipTap editor and persisted to IndexedDB via Dexie. A custom Lamport clock-based CRDT engine ensures deterministic conflict resolution when operations arrive out of order.

### 2. Socket Server as Transport Layer Only

The Socket.IO server handles **only** transport concerns: authentication, connection management, room management, presence, and broadcasting. It has **no direct database access**. All persistence goes through authenticated HTTP calls to the Next.js Internal API.

### 3. AI Provider Abstraction

The AI layer uses the Vercel AI SDK with a provider abstraction that supports OpenAI, Google Gemini, and Anthropic through a single environment variable (`AI_PROVIDER`). No code changes needed to switch providers.

### 4. Role-Based Access Control

Three roles exist: OWNER, EDITOR, VIEWER. Permissions are checked at the API layer. The Socket server validates roles via the Internal API before allowing operations.

## Data Flow

### Edit Operation

1. User types in TipTap editor
2. `onUpdate` fires → OperationEngine creates an operation with Lamport timestamp
3. Operation is stored in Dexie IndexedDB
4. Operation is sent via Socket.IO `operation:send`
5. Socket server validates, batches, and broadcasts to other clients
6. Socket server persists via Internal HTTP API → Next.js → Prisma → PostgreSQL
7. Other clients receive `operation:receive` and apply to their TipTap editor

### Reconnection

1. Client reconnects with `sync:reconnect` containing last known Lamport clock
2. Socket server fetches missed operations from the Internal API
3. Missing operations are sent back to the client
4. Client's CRDT engine applies operations deterministically

## Security Model

- JWT tokens generated by Auth.js, validated by Socket server middleware
- Internal API routes are gated by a shared `INTERNAL_SERVICE_TOKEN`
- No direct Prisma access from Socket server
- CORS configured for the frontend origin only
