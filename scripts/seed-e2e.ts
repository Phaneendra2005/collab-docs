import * as dotenv from 'dotenv'
dotenv.config()

import bcrypt from 'bcryptjs'

async function main() {
  console.log('DATABASE_URL is:', process.env.DATABASE_URL)
  const { prisma } = await import('../server/database/db')
  console.log('Seeding E2E database...')

  const hashedPassword = await bcrypt.hash('password123', 10)

  const userA = await prisma.user.upsert({
    where: { email: 'usera@example.com' },
    update: {},
    create: {
      email: 'usera@example.com',
      name: 'User A',
      // We rely on credentials provider which checks existence for now,
      // but in the future we may check password if it's stored.
    },
  })

  const userB = await prisma.user.upsert({
    where: { email: 'userb@example.com' },
    update: {},
    create: {
      email: 'userb@example.com',
      name: 'User B',
    },
  })

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@example.com' },
    update: {},
    create: {
      email: 'viewer@example.com',
      name: 'Viewer',
    },
  })

  await prisma.operation.deleteMany({ where: { documentId: 'e2e-doc-1' } })

  const document = await prisma.document.upsert({
    where: { id: 'e2e-doc-1' },
    update: { optimisticVersion: 1 },
    create: {
      id: 'e2e-doc-1',
      title: 'E2E Test Document',
      contentSnapshot: {},
      optimisticVersion: 1,
      ownerId: userA.id,
    },
  })

  // Assign roles
  await prisma.collaborator.upsert({
    where: {
      documentId_userId: { documentId: document.id, userId: userA.id },
    },
    update: { role: 'OWNER' },
    create: { documentId: document.id, userId: userA.id, role: 'OWNER' },
  })

  await prisma.collaborator.upsert({
    where: {
      documentId_userId: { documentId: document.id, userId: userB.id },
    },
    update: { role: 'EDITOR' },
    create: { documentId: document.id, userId: userB.id, role: 'EDITOR' },
  })

  await prisma.collaborator.upsert({
    where: {
      documentId_userId: { documentId: document.id, userId: viewer.id },
    },
    update: { role: 'VIEWER' },
    create: { documentId: document.id, userId: viewer.id, role: 'VIEWER' },
  })

  console.log('Seeding complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
