const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Demo User
  const hashedPw = await bcrypt.hash('demo1234', 12)
  const user = await prisma.user.upsert({
    where: { email: 'demo@sdboard.dev' },
    update: {},
    create: {
      name: 'Demo User',
      email: 'demo@sdboard.dev',
      password: hashedPw,
      image: null,
    },
  })
  console.log('✓ User:', user.email)

  // Demo Board
  const board = await prisma.board.upsert({
    where: { id: 'seed-board-1' },
    update: {},
    create: {
      id: 'seed-board-1',
      title: 'Webprojekt SS25',
      description: 'Demo Board für SDBoard',
      coverColor: '#5865f2',
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'owner' } },
      columns: {
        create: [
          { title: 'To Do',       order: 0 },
          { title: 'In Progress', order: 1 },
          { title: 'Done',        order: 2 },
        ]
      }
    },
    include: { columns: true }
  })
  console.log('✓ Board:', board.title)

  const todo = board.columns.find(c => c.title === 'To Do')
  const prog = board.columns.find(c => c.title === 'In Progress')

  // Demo Cards
  await prisma.card.createMany({
    skipDuplicates: true,
    data: [
      { id: 'seed-card-1', title: 'Next.js einrichten',   priority: 'high',   labels: ['dev'],    columnId: todo.id, boardId: board.id, createdById: user.id, order: 1000 },
      { id: 'seed-card-2', title: 'Prisma Schema bauen',  priority: 'high',   labels: ['dev'],    columnId: todo.id, boardId: board.id, createdById: user.id, order: 2000 },
      { id: 'seed-card-3', title: 'Auth implementieren',  priority: 'medium', labels: ['dev'],    columnId: prog.id, boardId: board.id, createdById: user.id, order: 1000 },
      { id: 'seed-card-4', title: 'Drag & Drop testen',   priority: 'low',    labels: ['qa'],     columnId: prog.id, boardId: board.id, createdById: user.id, order: 2000 },
    ]
  })
  console.log('✓ Cards created')
  console.log('🎉 Seed complete!')
  console.log('   Login: demo@sdboard.dev / demo1234')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
