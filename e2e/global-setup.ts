import { execSync } from 'child_process'

async function globalSetup() {
  console.log('Running E2E Database Seed...')
  try {
    execSync('npx tsx scripts/seed-e2e.ts', { stdio: 'inherit' })
  } catch (error) {
    console.error('Failed to seed database:', error)
    process.exit(1)
  }
}

export default globalSetup
