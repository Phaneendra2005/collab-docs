# Architecture

The system uses a Local-First architecture backed by Next.js 16, React 19, Neon PostgreSQL, and Dexie (IndexedDB).

## Core Components

1. **Frontend:** React 19 App Router UI.
2. **Local Storage:** Dexie for IndexedDB offline persistence.
3. **Sync Engine:** Background web worker pushing/pulling operations.
4. **WebSocket Server:** Real-time presence and operation broadcasting.
5. **Database:** Neon PostgreSQL storing the single source of truth for Documents and Operations.
