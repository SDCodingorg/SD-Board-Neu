import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import BoardClient from '@/components/BoardClient'

export default async function BoardPage({ params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth')

  const board = await prisma.board.findFirst({
    where: {
      id,
      members: { some: { userId: session.user.id } }
    },
    include: {
      columns: { orderBy: { order: 'asc' } },
      cards: {
        include: {
          comments: { include: { author: { select: { id:true, name:true, image:true } } }, orderBy: { createdAt: 'asc' } },
          checklists: { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
          assignees: true,
          timeTracking: true,
        },
        orderBy: { order: 'asc' }
      }
    }
  })

  if (!board) notFound()

  // Serialize dates
  const data = JSON.parse(JSON.stringify(board))

  return (
    <>
      <Navbar user={session.user} />
      <BoardClient board={data} user={session.user} />
    </>
  )
}
