# CollabDocs

A production-grade, real-time collaborative document editor built with Next.js, Socket.IO, and a custom CRDT synchronization engine.

## Features

- **Real-Time Collaboration** — Multiple users can edit the same document simultaneously with live cursors and presence indicators
- **Local-First Architecture** — All edits are saved to IndexedDB first, then synced via Socket.IO
- **CRDT Synchronization** — Custom Lamport clock-based conflict resolution ensures deterministic state across all clients
- **Rich Text Editing** — TipTap-powered editor with headings, lists, tables, code blocks, tasks, and more
- **AI Assistant** — Summarize, rewrite, fix grammar, continue writing, and generate titles using configurable AI providers (OpenAI, Google Gemini, Anthropic)
- **Version History** — Save, browse, preview, and restore document snapshots
- **Export** — Export documents as Markdown or print/save as PDF
- **Dashboard** — Search, filter, sort, favorite, archive, and manage documents
- **Role-Based Access** — Owner, Editor, and Viewer roles with invitation system
- **Offline Support** — Edits queue locally and sync when connectivity is restored

## Tech Stack

| Layer          | Technology                              |
| -------------- | --------------------------------------- |
| Frontend       | Next.js 16, React 19, TipTap            |
| Styling        | Tailwind CSS 4                          |
| Real-Time      | Socket.IO 4                             |
| Sync Engine    | Custom CRDT with Lamport Clocks         |
| Local Storage  | Dexie (IndexedDB)                       |
| Database       | PostgreSQL via Prisma ORM               |
| Authentication | Auth.js (NextAuth v5)                   |
| AI             | Vercel AI SDK with provider abstraction |
| Testing        | Vitest, Playwright                      |
| Deployment     | Docker, GitHub Actions                  |

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd collab-docs
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database URL, auth secrets, and AI keys

# 3. Set up database
npx prisma migrate dev

# 4. Start the development servers
# Terminal 1: Next.js
npm run dev

# Terminal 2: Socket.IO server
cd socket-server && npm install && npm run dev
```

## Environment Variables

See [`.env.example`](.env.example) for the complete list. Key variables:

| Variable                 | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string                             |
| `AUTH_SECRET`            | Auth.js secret (generate with `openssl rand -base64 32`) |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server URL (default: `http://localhost:3001`)  |
| `INTERNAL_SERVICE_TOKEN` | Shared secret between socket server and Next.js API      |
| `AI_PROVIDER`            | AI provider: `openai`, `google`, `anthropic`             |
| `OPENAI_API_KEY`         | OpenAI API key (when using OpenAI)                       |

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Browser    │◄───►│  Socket Server  │◄───►│    Redis     │
│  (React +    │     │  (Socket.IO)    │     │  (Pub/Sub)   │
│   Dexie +    │     └────────┬────────┘     └──────────────┘
│   TipTap)    │              │
└──────────────┘              │ Internal HTTP API
                              ▼
                    ┌─────────────────┐     ┌──────────────┐
                    │  Next.js App    │◄───►│  PostgreSQL  │
                    │  (API Routes)   │     │  (Prisma)    │
                    └─────────────────┘     └──────────────┘
```

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# Run database migrations
docker-compose exec app npx prisma migrate deploy
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests (requires running dev servers)
npm run test:e2e

# Lint and type check
npm run lint
npm run typecheck
```

## Project Structure

```
collab-docs/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (documents, AI, snapshots, auth)
│   ├── documents/[id]/     # Document editor page
│   └── page.tsx            # Dashboard (landing page)
├── client/sync/            # CRDT sync engine (Lamport clock, operations)
├── components/
│   ├── dashboard/          # Dashboard UI (DocumentList, search, filters)
│   ├── document/           # VersionHistory component
│   ├── editor/             # TipTapEditor, AIFeatures, ExportMenu, Presence
│   └── ui/                 # Reusable UI components
├── lib/                    # AI provider abstraction
├── server/                 # Backend services, controllers, repositories
├── socket-server/          # Standalone Socket.IO server
├── prisma/                 # Database schema and migrations
├── e2e/                    # Playwright E2E tests
├── Dockerfile              # Next.js production image
├── Dockerfile.socket       # Socket server production image
├── docker-compose.yml      # Full stack orchestration
└── .github/workflows/      # CI/CD pipeline
```

## License

MIT
