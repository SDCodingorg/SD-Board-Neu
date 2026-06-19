import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import DashboardClient from '@/components/DashboardClient'

export default async function Dashboard() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth')

  const boards = await prisma.board.findMany({
    where: { members: { some: { userId: session.user.id } } },
    include: {
      columns: { include: { _count: { select: { cards: true } } } },
      _count: { select: { cards: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Serialize for client
  const data = boards.map(b => ({
    id: b.id, title: b.title, description: b.description,
    coverColor: b.coverColor, background: b.background,
    deadline: b.deadline,
    totalCards: b._count.cards,
    columns: b.columns.map(c => ({ id: c.id, title: c.title, count: c._count.cards }))
  }))

  return (
    <>
      <Navbar user={session.user} />
      <DashboardClient boards={data} user={session.user} />
    </>
  )
}
