# Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+ (optional, falls back to in-memory)
- Docker & Docker Compose (for containerized deployment)

## Local Development

```bash
# Install dependencies
npm install
cd socket-server && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your values

# Set up database
npx prisma migrate dev

# Start Next.js dev server
npm run dev

# In a separate terminal, start socket server
cd socket-server && npm run dev
```

## Docker Deployment

### 1. Build and start

```bash
docker-compose up -d --build
```

### 2. Run database migrations

```bash
docker-compose exec app npx prisma migrate deploy
```

### 3. Verify

```bash
# Check services are running
docker-compose ps

# Check logs
docker-compose logs -f app
docker-compose logs -f socket-server
```

### 4. Stop

```bash
docker-compose down
```

## Environment Variables

| Variable                       | Required | Default                 | Description                                     |
| ------------------------------ | -------- | ----------------------- | ----------------------------------------------- |
| `DATABASE_URL`                 | ✅       | —                       | PostgreSQL connection string                    |
| `AUTH_SECRET`                  | ✅       | —                       | Auth.js secret for JWT signing                  |
| `NEXTAUTH_URL`                 | ✅       | `http://localhost:3000` | Canonical URL of the application                |
| `NEXT_PUBLIC_SOCKET_URL`       | ✅       | `http://localhost:3001` | Public URL of the Socket.IO server              |
| `INTERNAL_SERVICE_TOKEN`       | ✅       | `dev-token`             | Shared secret between socket server and Next.js |
| `AI_PROVIDER`                  | No       | `openai`                | AI provider: `openai`, `google`, `anthropic`    |
| `OPENAI_API_KEY`               | No       | —                       | OpenAI API key                                  |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No       | —                       | Google Gemini API key                           |
| `ANTHROPIC_API_KEY`            | No       | —                       | Anthropic API key                               |
| `REDIS_URL`                    | No       | —                       | Redis connection URL                            |

## Production Checklist

- [ ] Set strong `AUTH_SECRET` (min 32 chars, `openssl rand -base64 32`)
- [ ] Set strong `INTERNAL_SERVICE_TOKEN`
- [ ] Configure `NEXTAUTH_URL` to your production domain
- [ ] Configure `NEXT_PUBLIC_SOCKET_URL` to your production socket URL
- [ ] Run `npx prisma migrate deploy` before starting the app
- [ ] Ensure PostgreSQL is backed up regularly
- [ ] Enable HTTPS termination (via reverse proxy like Nginx or cloud load balancer)
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS origins in socket server for your domain

## Scaling Considerations

### Horizontal Scaling

- Use Redis adapter for Socket.IO to enable multiple socket server instances
- Next.js can be scaled behind a load balancer
- PostgreSQL can use read replicas for read-heavy workloads

### Performance

- Static assets are served from `.next/static` and can be CDN-cached
- Socket.IO uses WebSocket transport (no polling fallback in production)
- Dexie IndexedDB provides offline-first resilience
