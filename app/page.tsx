import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import Dashboard from '@/components/dashboard/Dashboard'

export default async function Home() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/api/auth/signin')
  }

  return (
    <Dashboard
      userId={session.user.id}
      userName={session.user.name || 'User'}
      userImage={session.user.image || undefined}
    />
  )
}
