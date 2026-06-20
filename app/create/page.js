import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import CreateBoardForm from '@/components/CreateBoardForm'

export const dynamic = 'force-dynamic'

export default async function CreatePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth')
  return (
    <>
      <Navbar user={session.user} />
      <CreateBoardForm />
    </>
  )
}
