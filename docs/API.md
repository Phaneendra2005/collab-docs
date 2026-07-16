# API Reference

## Authentication

### POST /api/auth/socket-token

Generate a JWT token for Socket.IO authentication.

**Request Body:**

```json
{ "documentId": "string" }
```

**Response:**

```json
{ "token": "jwt-string" }
```

---

## Documents

### GET /api/documents

List documents for the authenticated user.

**Query Parameters:**

| Param    | Type                                                     | Default     | Description       |
| -------- | -------------------------------------------------------- | ----------- | ----------------- |
| `search` | string                                                   | —           | Search by title   |
| `sort`   | `updatedAt` \| `createdAt` \| `title`                    | `updatedAt` | Sort order        |
| `filter` | `all` \| `owner` \| `shared` \| `favorite` \| `archived` | `all`       | Filter collection |
| `limit`  | number (1-50)                                            | 20          | Page size         |
| `cursor` | string                                                   | —           | Pagination cursor |

**Response:**

```json
{
  "data": [{ "id": "...", "title": "...", "updatedAt": "...", ... }],
  "nextCursor": "string | null"
}
```

### POST /api/documents

Create a new document.

**Request Body:**

```json
{ "title": "string (optional, default: 'Untitled')" }
```

### GET /api/documents/[id]

Get a single document.

### PATCH /api/documents/[id]

Update a document.

**Request Body:**

```json
{
  "title": "string (optional)",
  "isFavorite": "boolean (optional)",
  "isArchived": "boolean (optional)"
}
```

### DELETE /api/documents/[id]

Soft-delete a document (owner only).

---

## Version History

### GET /api/documents/[id]/snapshots

List version snapshots for a document.

### POST /api/documents/[id]/snapshots

Create a new version snapshot.

**Request Body:**

```json
{
  "snapshot": "JSON string of editor content",
  "metadata": { "name": "Version name (optional)" }
}
```

### GET /api/documents/[id]/snapshots/[versionId]

Get a specific version snapshot with full content.

---

## AI Features

All AI endpoints require EDITOR or OWNER role.

### POST /api/documents/[id]/ai/summarize

Summarize the document text.

### POST /api/documents/[id]/ai/rewrite

Rewrite selected text to be clearer and more professional.

### POST /api/documents/[id]/ai/grammar

Fix grammar, spelling, and punctuation errors.

### POST /api/documents/[id]/ai/continue

Continue writing from the given text.

### POST /api/documents/[id]/ai/title

Generate a title for the document.

**Common Request Body (all AI endpoints):**

```json
{ "text": "string (required)" }
```

**Common Response:**

```json
{ "result": "string" }
```

---

## Internal API (Socket Server ↔ Next.js)

These endpoints are **not for public use**. They require the `INTERNAL_SERVICE_TOKEN` in the `Authorization` header.

### GET /api/internal/roles

Check a user's role for a document.

**Query:** `?userId=...&documentId=...`

### POST /api/internal/operations

Fetch operations for a document.

### POST /api/internal/operations/batch

Persist a batch of operations.

---

## Socket.IO Events

### Client → Server

| Event             | Payload                                                  | Description               |
| ----------------- | -------------------------------------------------------- | ------------------------- |
| `room:join`       | `documentId: string`                                     | Join a document room      |
| `operation:send`  | `Operation`                                              | Send an edit operation    |
| `sync:reconnect`  | `{ documentId, lastLamportClock, lastAckedOperationId }` | Request missed operations |
| `presence:update` | `{ cursor, selection, isTyping }`                        | Update presence state     |

### Server → Client

| Event               | Payload                                    | Description                |
| ------------------- | ------------------------------------------ | -------------------------- |
| `operation:receive` | `Operation`                                | Receive a remote operation |
| `presence:update`   | `{ actorId, cursor, selection, isTyping }` | Receive presence update    |
| `room:users`        | `User[]`                                   | Current room users list    |
