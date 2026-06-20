'use server'

import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { revalidatePath, refresh } from 'next/cache'
import { authOptions } from '../auth'
import { prisma } from '../prisma'

const WRITE_ROLES = new Set(['owner', 'admin', 'editor'])
const ADMIN_ROLES = new Set(['owner', 'admin'])

async function getSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error('Nicht eingeloggt')
  return session
}

async function getBoardAccess(boardId, userId) {
  const member = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
    include: { board: { select: { ownerId: true } } },
  })
  if (!member) throw new Error('Kein Zugriff auf dieses Board')
  return member
}

function assertRole(member, allowedRoles, message = 'Keine Berechtigung fuer diese Aktion') {
  if (!allowedRoles.has(member.role)) throw new Error(message)
}

async function assertCanWrite(boardId, userId) {
  const member = await getBoardAccess(boardId, userId)
  assertRole(member, WRITE_ROLES, 'Du hast nur Leserechte fuer dieses Board')
  return member
}

async function assertCanAdmin(boardId, userId) {
  const member = await getBoardAccess(boardId, userId)
  assertRole(member, ADMIN_ROLES)
  return member
}

function normalizeRole(role) {
  if (role === 'viewer') return 'viewer'
  if (role === 'admin') return 'admin'
  return 'editor'
}

function revalidateBoard(boardId) {
  revalidatePath('/')
  revalidatePath(`/board/${boardId}`)
}

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
          { title: 'To Do', order: 0 },
          { title: 'In Progress', order: 1 },
          { title: 'Done', order: 2 },
        ],
      },
    },
    select: { id: true },
  })

  revalidatePath('/')
  refresh()
  return board.id
}

export async function deleteBoard(boardId) {
  const session = await getSession()
  const access = await assertCanAdmin(boardId, session.user.id)
  if (access.board.ownerId !== session.user.id) throw new Error('Nur der Owner kann das Board loeschen')

  await prisma.board.delete({ where: { id: boardId } })
  revalidatePath('/')
  refresh()
}

export async function updateBoard(boardId, data) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)
  await prisma.board.update({ where: { id: boardId }, data })
  revalidateBoard(boardId)
  refresh()
}

export async function toggleShare(boardId) {
  const session = await getSession()
  await assertCanAdmin(boardId, session.user.id)

  const board = await prisma.board.findUnique({ where: { id: boardId } })
  if (!board) throw new Error('Board nicht gefunden')

  if (board.shareToken) {
    await prisma.board.update({ where: { id: boardId }, data: { shareToken: null, isPublic: false } })
    revalidateBoard(boardId)
    refresh()
    return null
  }

  const token = randomBytes(16).toString('hex')
  await prisma.board.update({ where: { id: boardId }, data: { shareToken: token, isPublic: true } })
  revalidateBoard(boardId)
  refresh()
  return token
}

async function findInviteUser(identifier) {
  const value = identifier?.trim()
  if (!value) throw new Error('Discord Name, User ID oder Email ist erforderlich')

  const byDiscordId = await prisma.user.findFirst({
    where: {
      accounts: {
        some: {
          provider: 'discord',
          providerAccountId: value,
        },
      },
    },
    select: { id: true },
  })
  if (byDiscordId) return byDiscordId

  if (value.includes('@')) {
    return prisma.user.findFirst({
      where: { email: { equals: value, mode: 'insensitive' } },
      select: { id: true },
    })
  }

  const nameMatches = await prisma.user.findMany({
    where: { name: { equals: value, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  })

  if (nameMatches.length > 1) {
    throw new Error('Mehrere Accounts haben diesen Namen. Bitte Discord User ID verwenden.')
  }

  return nameMatches[0] ?? null
}

export async function addBoardMember(boardId, identifier, role = 'editor') {
  try {
    const session = await getSession()
    await assertCanAdmin(boardId, session.user.id)

    const user = await findInviteUser(identifier)
    if (!user) return { ok: false, error: 'Account nicht gefunden. Die Person muss sich einmal mit Discord anmelden.' }

    if (user.id === session.user.id) return { ok: false, error: 'Du bist bereits Mitglied' }

    await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: user.id } },
      update: { role: normalizeRole(role) },
      create: { boardId, userId: user.id, role: normalizeRole(role) },
    })

    revalidateBoard(boardId)
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || 'Mitglied konnte nicht hinzugefuegt werden' }
  }
}

export async function updateBoardMemberRole(boardId, memberUserId, role) {
  const session = await getSession()
  const access = await assertCanAdmin(boardId, session.user.id)
  if (memberUserId === access.board.ownerId) throw new Error('Owner-Rolle kann nicht geaendert werden')

  await prisma.boardMember.update({
    where: { boardId_userId: { boardId, userId: memberUserId } },
    data: { role: normalizeRole(role) },
  })

  revalidateBoard(boardId)
  refresh()
}

export async function removeBoardMember(boardId, memberUserId) {
  const session = await getSession()
  const access = await assertCanAdmin(boardId, session.user.id)
  if (memberUserId === access.board.ownerId) throw new Error('Owner kann nicht entfernt werden')

  await prisma.boardMember.delete({
    where: { boardId_userId: { boardId, userId: memberUserId } },
  })

  revalidateBoard(boardId)
  refresh()
}

export async function addColumn(boardId, title) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)
  if (!title?.trim()) throw new Error('Spalten-Name ist erforderlich')

  const count = await prisma.column.count({ where: { boardId } })
  await prisma.column.create({ data: { boardId, title: title.trim(), order: count } })
  revalidateBoard(boardId)
  refresh()
}

export async function deleteColumn(boardId, columnId) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  await prisma.column.delete({ where: { id: columnId, boardId } })
  revalidateBoard(boardId)
  refresh()
}

export async function renameColumn(boardId, columnId, title) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)
  if (!title?.trim()) throw new Error('Spalten-Name ist erforderlich')

  await prisma.column.update({ where: { id: columnId, boardId }, data: { title: title.trim() } })
  revalidateBoard(boardId)
  refresh()
}

export async function reorderColumns(boardId, orderedIds) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const columns = await prisma.column.findMany({
    where: { boardId, id: { in: orderedIds } },
    select: { id: true },
  })
  if (columns.length !== orderedIds.length) throw new Error('Ungueltige Spalten-Reihenfolge')

  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.column.update({ where: { id, boardId }, data: { order: i } }))
  )
  revalidateBoard(boardId)
  refresh()
}

export async function addCard(boardId, columnId, { title, priority = 'medium', labels = [], deadline, startDate }) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)
  if (!title?.trim()) throw new Error('Karten-Name ist erforderlich')

  const column = await prisma.column.findUnique({ where: { id: columnId, boardId }, select: { id: true } })
  if (!column) throw new Error('Spalte gehoert nicht zu diesem Board')

  const count = await prisma.card.count({ where: { columnId, boardId } })
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
      timeTracking: { create: { totalSeconds: 0 } },
    },
    select: { id: true },
  })

  revalidateBoard(boardId)
  refresh()
  return card.id
}

export async function updateCard(boardId, cardId, data) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  await prisma.card.update({ where: { id: cardId, boardId }, data })
  revalidateBoard(boardId)
  refresh()
}

export async function moveCard(boardId, cardId, toColumnId, order) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const column = await prisma.column.findUnique({ where: { id: toColumnId, boardId }, select: { id: true } })
  if (!column) throw new Error('Zielspalte gehoert nicht zu diesem Board')

  await prisma.card.update({
    where: { id: cardId, boardId },
    data: { columnId: toColumnId, order },
  })
  revalidateBoard(boardId)
  refresh()
}

export async function deleteCard(boardId, cardId) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  await prisma.card.delete({ where: { id: cardId, boardId } })
  revalidateBoard(boardId)
  refresh()
}

export async function addComment(boardId, cardId, text) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)
  if (!text?.trim()) throw new Error('Kommentar darf nicht leer sein')

  const card = await prisma.card.findUnique({ where: { id: cardId, boardId }, select: { id: true } })
  if (!card) throw new Error('Karte gehoert nicht zu diesem Board')

  await prisma.comment.create({
    data: { text: text.trim(), cardId, authorId: session.user.id },
  })
  revalidateBoard(boardId)
  refresh()
}

export async function updateTimeTracking(boardId, cardId, { totalSeconds, isRunning, startedAt }) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const card = await prisma.card.findUnique({ where: { id: cardId, boardId }, select: { id: true } })
  if (!card) throw new Error('Karte gehoert nicht zu diesem Board')

  await prisma.timeTracking.upsert({
    where: { cardId },
    update: { totalSeconds, isRunning, startedAt },
    create: { cardId, totalSeconds, isRunning, startedAt },
  })
  revalidateBoard(boardId)
  refresh()
}

export async function updateChecklist(boardId, cardId, checklists) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const card = await prisma.card.findUnique({ where: { id: cardId, boardId }, select: { id: true } })
  if (!card) throw new Error('Karte gehoert nicht zu diesem Board')

  await prisma.$transaction(async (tx) => {
    await tx.checklist.deleteMany({ where: { cardId } })
    for (const cl of checklists) {
      await tx.checklist.create({
        data: {
          id: cl.id,
          title: cl.title,
          cardId,
          order: cl.order || 0,
          items: {
            create: cl.items.map((item, i) => ({
              text: item.text,
              checked: item.checked,
              order: i,
            })),
          },
        },
      })
    }
  })

  revalidateBoard(boardId)
  refresh()
}
