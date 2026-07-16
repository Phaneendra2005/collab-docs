# Security

## Authentication

- **Auth.js (NextAuth v5)** handles user authentication
- Supports OAuth providers (GitHub, Google) and Credentials-based login
- Sessions are JWT-based, signed with `AUTH_SECRET`
- Socket.IO connections are authenticated via JWT tokens issued by `/api/auth/socket-token`

## Authorization

### Role-Based Access Control

| Role   | Can View | Can Edit | Can Delete | Can Invite |
| ------ | -------- | -------- | ---------- | ---------- |
| OWNER  | ✅       | ✅       | ✅         | ✅         |
| EDITOR | ✅       | ✅       | ❌         | ❌         |
| VIEWER | ✅       | ❌       | ❌         | ❌         |

### Permission Enforcement

- **API Layer**: Every API route checks the authenticated session and validates the user's role for the requested document
- **Socket Layer**: The auth middleware validates JWT tokens and checks document roles via the Internal API before allowing connections
- **Editor Layer**: The TipTap editor respects the `editable` prop based on the user's role

## Internal API Security

The Socket.IO server communicates with Next.js via internal HTTP API routes (`/api/internal/*`). These routes are protected by a shared `INTERNAL_SERVICE_TOKEN` sent in the `Authorization` header.

```
Socket Server → Authorization: Bearer <INTERNAL_SERVICE_TOKEN> → Next.js Internal API
```

**Important**: This token must be kept secret and never exposed to clients.

## Data Security

### At Rest

- Passwords (when using Credentials provider) are hashed with bcrypt
- Database connections use SSL in production (configurable via `DATABASE_URL`)

### In Transit

- All client-server communication should use HTTPS in production
- Socket.IO connections use WSS (WebSocket Secure) when behind HTTPS
- JWT tokens are transmitted via the `auth` option in Socket.IO handshake

## Environment Variables

- `AUTH_SECRET`: Must be at least 32 characters, randomly generated
- `INTERNAL_SERVICE_TOKEN`: Shared secret, never exposed to clients
- API keys (OpenAI, Google, Anthropic): Server-side only, never sent to the client

## Best Practices

1. **Never commit `.env` files** — Use `.env.example` as a template
2. **Rotate secrets regularly** — Especially `AUTH_SECRET` and `INTERNAL_SERVICE_TOKEN`
3. **Use HTTPS everywhere** — Including WebSocket connections
4. **Restrict CORS** — Only allow your frontend origin
5. **Keep dependencies updated** — Run `npm audit` regularly
6. **Enable rate limiting** — On public API routes in production
