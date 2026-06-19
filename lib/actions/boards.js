'use server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth'
import { prisma } from '../prisma'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'

async function getSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error('Nicht eingeloggt')
  return session
}

// ── Board CRUD ───────────────────────────────────────────────

export async function createBoard({ title, description, deadline, coverColor, background }) {
  const session = await getSession()
  if (!title?.trim()) throw new Error('Board-Name ist erforderlich')

  const board = await prisma.board.create({
    data: {
      title: title.trim(),
      description: description || '',
      deadline: deadline || null,
      coverColor: coverColor || '#5865f2',
      background: background || '',
      ownerId: session.user.id,
      members: { create: { userId: session.user.id, role: 'owner' } },
      columns: {
        create: [
          { title: 'To Do',       order: 0 },
          { title: 'In Progress', order: 1 },
          { title: 'Done',        order: 2 },
        ]
      }
    }
  })
  revalidatePath('/')
  return board.id
}

export async function deleteBoard(boardId) {
  const session = await getSession()
  await prisma.board.deleteMany({
    where: { id: boardId, ownerId: session.user.id }
  })
  revalidatePath('/')
}

export async function updateBoard(boardId, data) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.board.update({ where: { id: boardId }, data })
  revalidatePath(`/board/${boardId}`)
}

export async function toggleShare(boardId) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  const board = await prisma.board.findUnique({ where: { id: boardId } })
  if (!board) throw new Error('Board nicht gefunden')

  if (board.shareToken) {
    await prisma.board.update({ where: { id: boardId }, data: { shareToken: null, isPublic: false } })
    revalidatePath(`/board/${boardId}`)
    return null
  } else {
    const token = randomBytes(6).toString('hex')
    await prisma.board.update({ where: { id: boardId }, data: { shareToken: token, isPublic: true } })
    revalidatePath(`/board/${boardId}`)
    return token
  }
}

export async function addColumn(boardId, title) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  const count = await prisma.column.count({ where: { boardId } })
  await prisma.column.create({ data: { boardId, title, order: count } })
  revalidatePath(`/board/${boardId}`)
}

export async function deleteColumn(boardId, columnId) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.column.delete({ where: { id: columnId } })
  revalidatePath(`/board/${boardId}`)
}

export async function renameColumn(boardId, columnId, title) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.column.update({ where: { id: columnId }, data: { title } })
  revalidatePath(`/board/${boardId}`)
}

export async function reorderColumns(boardId, orderedIds) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await Promise.all(
    orderedIds.map((id, i) => prisma.column.update({ where: { id }, data: { order: i } }))
  )
  revalidatePath(`/board/${boardId}`)
}

// ── Card CRUD ───────────────────────────────────────────────

export async function addCard(boardId, columnId, { title, priority = 'medium', labels = [], deadline, startDate }) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  if (!title?.trim()) throw new Error('Karten-Name ist erforderlich')

  const count = await prisma.card.count({ where: { columnId } })
  const card = await prisma.card.create({
    data: {
      title: title.trim(),
      priority,
      labels,
      deadline: deadline || null,
      startDate: startDate || null,
      columnId,
      boardId,
      createdById: session.user.id,
      order: (count + 1) * 1000,
      timeTracking: { create: { totalSeconds: 0 } }
    }
  })
  revalidatePath(`/board/${boardId}`)
  return card.id
}

export async function updateCard(boardId, cardId, data) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.card.update({ where: { id: cardId }, data })
  revalidatePath(`/board/${boardId}`)
}

export async function moveCard(boardId, cardId, toColumnId, order) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.card.update({
    where: { id: cardId },
    data: { columnId: toColumnId, order }
  })
  revalidatePath(`/board/${boardId}`)
}

export async function deleteCard(boardId, cardId) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.card.delete({ where: { id: cardId } })
  revalidatePath(`/board/${boardId}`)
}

export async function addComment(boardId, cardId, text) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  if (!text?.trim()) throw new Error('Kommentar darf nicht leer sein')

  await prisma.comment.create({
    data: { text: text.trim(), cardId, authorId: session.user.id }
  })
  revalidatePath(`/board/${boardId}`)
}

export async function updateTimeTracking(boardId, cardId, { totalSeconds, isRunning, startedAt }) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  await prisma.timeTracking.upsert({
    where: { cardId },
    update: { totalSeconds, isRunning, startedAt },
    create: { cardId, totalSeconds, isRunning, startedAt }
  })
}

export async function updateChecklist(boardId, cardId, checklists) {
  const session = await getSession()
  await assertMember(boardId, session.user.id)
  // Delete old, re-create
  await prisma.checklist.deleteMany({ where: { cardId } })
  for (const cl of checklists) {
    await prisma.checklist.create({
      data: {
        id: cl.id,
        title: cl.title,
        cardId,
        order: cl.order || 0,
        items: {
          create: cl.items.map((item, i) => ({
            text: item.text,
            checked: item.checked,
            order: i
          }))
        }
      }
    })
  }
  revalidatePath(`/board/${boardId}`)
}

// ── Helper ──────────────────────────────────────────────────
async function assertMember(boardId, userId) {
  const m = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } }
  })
  if (!m) throw new Error('Kein Zugriff auf dieses Board')
}
