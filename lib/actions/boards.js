'use server'

import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { revalidatePath, refresh } from 'next/cache'
import { authOptions } from '../auth'
import { prisma } from '../prisma'

const WRITE_ROLES = new Set(['owner', 'admin', 'editor'])
const ADMIN_ROLES = new Set(['owner', 'admin'])
const DEFAULT_LABELS = [
  { name: 'dev', color: '#5865f2', order: 0 },
  { name: 'qa', color: '#22c55e', order: 1 },
  { name: 'design', color: '#eab308', order: 2 },
]

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

function normalizeLabelName(name) {
  return name?.trim().replace(/\s+/g, ' ').slice(0, 32)
}

function normalizeLabelColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color.toLowerCase() : '#5865f2'
}

function normalizePriority(priority) {
  return ['high', 'medium', 'low'].includes(priority) ? priority : 'medium'
}

function normalizeDateString(value) {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function normalizeChecklist(checklist, index) {
  const title = String(checklist?.title || `Checkliste ${index + 1}`).trim().slice(0, 80)
  const rawItems = Array.isArray(checklist?.items) ? checklist.items : []
  const items = rawItems
    .map((item, itemIndex) => {
      if (typeof item === 'string') return { text: item.trim(), checked: false, order: itemIndex }
      return {
        text: String(item?.text || '').trim(),
        checked: Boolean(item?.checked),
        order: itemIndex,
      }
    })
    .filter(item => item.text)
    .slice(0, 50)

  return items.length ? { title: title || `Checkliste ${index + 1}`, items } : null
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
      labels: { create: DEFAULT_LABELS },
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
  data = data || {}
  const nextData = {}
  if (Object.hasOwn(data, 'title')) {
    const title = String(data.title || '').trim()
    if (!title) throw new Error('Board-Name ist erforderlich')
    nextData.title = title.slice(0, 120)
  }
  if (Object.hasOwn(data, 'description')) nextData.description = String(data.description || '').trim().slice(0, 5000)
  if (Object.hasOwn(data, 'deadline')) nextData.deadline = normalizeDateString(data.deadline)
  if (Object.hasOwn(data, 'coverColor')) nextData.coverColor = normalizeLabelColor(data.coverColor)
  if (Object.hasOwn(data, 'background')) nextData.background = String(data.background || '').trim().slice(0, 500)
  if (!Object.keys(nextData).length) throw new Error('Keine Board-Aenderung gefunden')
  await prisma.board.update({ where: { id: boardId }, data: nextData })
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

export async function updateColumnWidth(boardId, columnId, width) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const nextWidth = Math.max(220, Math.min(460, Number(width) || 300))
  await prisma.column.update({ where: { id: columnId, boardId }, data: { width: nextWidth } })
  revalidateBoard(boardId)
  refresh()
}

export async function createBoardLabel(boardId, { name, color }) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const labelName = normalizeLabelName(name)
  if (!labelName) throw new Error('Label-Name ist erforderlich')

  const count = await prisma.boardLabel.count({ where: { boardId } })
  await prisma.boardLabel.create({
    data: {
      boardId,
      name: labelName,
      color: normalizeLabelColor(color),
      order: count,
    },
  })
  revalidateBoard(boardId)
  refresh()
}

export async function updateBoardLabel(boardId, labelId, { name, color }) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const labelName = normalizeLabelName(name)
  if (!labelName) throw new Error('Label-Name ist erforderlich')

  await prisma.$transaction(async (tx) => {
    const existing = await tx.boardLabel.findFirst({ where: { id: labelId, boardId } })
    if (!existing) throw new Error('Label nicht gefunden')

    await tx.boardLabel.update({
      where: { id: labelId },
      data: { name: labelName, color: normalizeLabelColor(color) },
    })

    if (existing.name !== labelName) {
      const cards = await tx.card.findMany({
        where: { boardId, labels: { has: existing.name } },
        select: { id: true, labels: true },
      })

      for (const card of cards) {
        const labels = Array.from(new Set(card.labels.map(label => label === existing.name ? labelName : label)))
        await tx.card.update({ where: { id: card.id }, data: { labels } })
      }
    }
  })

  revalidateBoard(boardId)
  refresh()
}

export async function deleteBoardLabel(boardId, labelId) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  await prisma.$transaction(async (tx) => {
    const existing = await tx.boardLabel.findFirst({ where: { id: labelId, boardId } })
    if (!existing) throw new Error('Label nicht gefunden')

    await tx.boardLabel.delete({ where: { id: labelId } })

    const cards = await tx.card.findMany({
      where: { boardId, labels: { has: existing.name } },
      select: { id: true, labels: true },
    })

    for (const card of cards) {
      await tx.card.update({
        where: { id: card.id },
        data: { labels: card.labels.filter(label => label !== existing.name) },
      })
    }
  })

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

export async function importCards(boardId, defaultColumnId, cards) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  if (!Array.isArray(cards) || cards.length === 0) throw new Error('Keine Karten zum Importieren gefunden')
  if (cards.length > 100) throw new Error('Maximal 100 Karten pro Import')

  const columns = await prisma.column.findMany({
    where: { boardId },
    select: { id: true, title: true, order: true },
  })
  const defaultColumn = columns.find(column => column.id === defaultColumnId) || columns[0]
  if (!defaultColumn) throw new Error('Keine Zielspalte gefunden')

  const columnByTitle = new Map(columns.map(column => [column.title.trim().toLowerCase(), column]))
  const columnIds = new Set(columns.map(column => column.id))

  const normalizedCards = cards.map((card, index) => {
    const title = String(card?.title || '').trim()
    if (!title) throw new Error(`Karte ${index + 1}: Titel fehlt`)

    const requestedColumnTitle = String(card?.column || card?.columnTitle || '').trim().slice(0, 80)
    const requestedColumnKey = requestedColumnTitle.toLowerCase()
    const requestedColumn = requestedColumnKey ? columnByTitle.get(requestedColumnKey) : null
    const requestedColumnId = columnIds.has(card?.columnId) ? card.columnId : null
    const columnId = requestedColumnId || requestedColumn?.id || defaultColumn.id
    const rawLabels = Array.isArray(card?.labels)
      ? card.labels
      : String(card?.labels || '').split(',').map(label => label.trim()).filter(Boolean)

    return {
      title: title.slice(0, 180),
      description: String(card?.description || '').trim().slice(0, 5000),
      priority: normalizePriority(card?.priority),
      labels: Array.from(new Set(rawLabels.map(normalizeLabelName).filter(Boolean))).slice(0, 12),
      deadline: normalizeDateString(card?.deadline || card?.dueDate),
      startDate: normalizeDateString(card?.startDate),
      checklists: Array.isArray(card?.checklists)
        ? card.checklists.map(normalizeChecklist).filter(Boolean).slice(0, 10)
        : [],
      columnId,
      columnTitle: requestedColumnId || requestedColumn ? '' : requestedColumnTitle,
    }
  })

  let createdColumns = 0
  await prisma.$transaction(async (tx) => {
    const columnLookup = new Map(columns.map(column => [column.title.trim().toLowerCase(), column]))
    let nextColumnOrder = columns.length ? Math.max(...columns.map(column => column.order)) + 1 : 0
    const missingColumnTitles = Array.from(new Set(normalizedCards
      .map(card => card.columnTitle)
      .filter(Boolean)))

    for (const title of missingColumnTitles) {
      const key = title.toLowerCase()
      if (columnLookup.has(key)) continue
      const column = await tx.column.create({
        data: { boardId, title, order: nextColumnOrder++ },
        select: { id: true, title: true, order: true },
      })
      columnLookup.set(key, column)
      createdColumns += 1
    }

    const resolvedCards = normalizedCards.map(card => {
      if (!card.columnTitle) return card
      const column = columnLookup.get(card.columnTitle.toLowerCase())
      return { ...card, columnId: column?.id || defaultColumn.id }
    })

    const existingLabels = await tx.boardLabel.findMany({
      where: { boardId },
      select: { name: true, order: true },
      orderBy: { order: 'asc' },
    })
    const knownLabels = new Set(existingLabels.map(label => label.name))
    let nextLabelOrder = existingLabels.length ? Math.max(...existingLabels.map(label => label.order)) + 1 : 0

    for (const label of Array.from(new Set(resolvedCards.flatMap(card => card.labels)))) {
      if (!knownLabels.has(label)) {
        await tx.boardLabel.create({
          data: { boardId, name: label, color: '#5865f2', order: nextLabelOrder++ },
        })
        knownLabels.add(label)
      }
    }

    const orderCounters = new Map()
    for (const columnId of Array.from(new Set(resolvedCards.map(card => card.columnId)))) {
      const count = await tx.card.count({ where: { boardId, columnId } })
      orderCounters.set(columnId, count)
    }

    for (const card of resolvedCards) {
      const nextIndex = (orderCounters.get(card.columnId) || 0) + 1
      orderCounters.set(card.columnId, nextIndex)
      await tx.card.create({
        data: {
          title: card.title,
          description: card.description,
          priority: card.priority,
          labels: card.labels,
          deadline: card.deadline,
          startDate: card.startDate,
          columnId: card.columnId,
          boardId,
          createdById: session.user.id,
          order: nextIndex * 1000,
          timeTracking: { create: { totalSeconds: 0 } },
          checklists: card.checklists.length ? {
            create: card.checklists.map((checklist, checklistIndex) => ({
              title: checklist.title,
              order: checklistIndex,
              items: {
                create: checklist.items.map((item, itemIndex) => ({
                  text: item.text,
                  checked: item.checked,
                  order: itemIndex,
                })),
              },
            })),
          } : undefined,
        },
      })
    }
  })

  revalidateBoard(boardId)
  refresh()
  return { count: normalizedCards.length, createdColumns }
}

export async function updateCard(boardId, cardId, data) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  await prisma.card.update({ where: { id: cardId, boardId }, data })
  revalidateBoard(boardId)
  refresh()
}

export async function toggleCardAssignee(boardId, cardId, memberUserId) {
  const session = await getSession()
  await assertCanWrite(boardId, session.user.id)

  const card = await prisma.card.findUnique({ where: { id: cardId, boardId }, select: { id: true } })
  if (!card) throw new Error('Karte gehoert nicht zu diesem Board')

  const member = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: memberUserId } },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  })
  if (!member) throw new Error('Nutzer ist kein Mitglied dieses Boards')

  const existing = await prisma.cardAssignee.findFirst({
    where: { cardId, userId: memberUserId },
  })

  if (existing) {
    await prisma.cardAssignee.deleteMany({ where: { cardId, userId: memberUserId } })
    revalidateBoard(boardId)
    refresh()
    return { assigned: false, userId: memberUserId }
  }

  const assignee = await prisma.cardAssignee.create({
    data: {
      cardId,
      userId: member.user.id,
      name: member.user.name || member.user.email || 'Nutzer',
      image: member.user.image,
    },
  })

  revalidateBoard(boardId)
  refresh()
  return { assigned: true, assignee }
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
