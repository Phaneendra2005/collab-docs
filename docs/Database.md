# Database Architecture

The database is built on PostgreSQL using Prisma.

## Core Models

- `User`, `Account`, `Session`, `VerificationToken` (NextAuth)
- `Document`: Represents the document metadata (slug, icon, coverImage).
- `Collaborator`: Links `User` and `Document` with RBAC Roles.
- `Operation`: The deterministic log of CRDT operations.
- `DocumentVersion`: Squashed snapshots of the document state.
- `AuditLog`: Action tracking for security.
