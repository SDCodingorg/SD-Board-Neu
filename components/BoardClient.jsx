'use client'
import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDroppable
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import {
  addCard, importCards, moveCard, deleteBoard, updateBoard, addColumn, deleteColumn, renameColumn, reorderColumns,
  updateColumnWidth, addComment, updateCard, deleteCard, toggleShare, updateChecklist,
  createBoardLabel, updateBoardLabel, deleteBoardLabel, toggleCardAssignee,
  addBoardMember, updateBoardMemberRole, removeBoardMember
} from '@/lib/actions/boards'
import CardModal from './CardModal'
import WhiteboardView from './WhiteboardView'

const PRIORITIES = {
  high:   { color:'#ef4444', bg:'rgba(239,68,68,.15)',   border:'rgba(239,68,68,.3)',  label:'High'   },
  medium: { color:'#eab308', bg:'rgba(234,179,8,.15)',   border:'rgba(234,179,8,.3)',  label:'Medium' },
  low:    { color:'#22c55e', bg:'rgba(34,197,94,.15)',   border:'rgba(34,197,94,.3)',  label:'Low'    },
}
const DEFAULT_LABEL_DEFS = [
  { id:'default-dev', name:'dev', color:'#5865f2' },
  { id:'default-design', name:'design', color:'#a855f7' },
  { id:'default-bug', name:'bug', color:'#ef4444' },
  { id:'default-docs', name:'docs', color:'#38bdf8' },
  { id:'default-qa', name:'qa', color:'#22c55e' },
  { id:'default-ux', name:'ux', color:'#eab308' },
]
const MIN_COLUMN_WIDTH = 220
const MAX_COLUMN_WIDTH = 460

const defaultFilters = {
  keyword: '',
  mine: false,
  unassigned: false,
  overdue: false,
  dueToday: false,
  dueWeek: false,
  noDue: false,
  priorities: [],
  labels: [],
  columns: [],
}

function parseDeadline(value) {
  if (!value) return null
  const date = new Date(value + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function hexToRgba(hex, alpha) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex || '') ? hex.slice(1) : '5865f2'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function parseImportedCards(input) {
  const text = input.trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    const cards = Array.isArray(parsed) ? parsed : parsed.cards
    if (!Array.isArray(cards)) throw new Error('JSON braucht ein Array oder { "cards": [...] }')
    return cards.map(card => ({
      title: String(card.title || '').trim(),
      description: String(card.description || '').trim(),
      priority: ['high', 'medium', 'low'].includes(card.priority) ? card.priority : 'medium',
      labels: Array.isArray(card.labels) ? card.labels : String(card.labels || '').split(',').map(label => label.trim()).filter(Boolean),
      deadline: card.deadline || card.dueDate || '',
      startDate: card.startDate || '',
      column: card.column || card.columnTitle || '',
      checklists: Array.isArray(card.checklists) ? card.checklists : [],
    })).filter(card => card.title)
  } catch (error) {
    if (text.startsWith('{') || text.startsWith('[')) throw error
  }

  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*•]\s*/, '').replace(/^\[[ xX]\]\s*/, '').trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(part => part.trim())
      return {
        title: parts[0],
        priority: ['high', 'medium', 'low'].includes(parts[1]) ? parts[1] : 'medium',
        labels: parts[2] ? parts[2].split(',').map(label => label.trim()).filter(Boolean) : [],
        deadline: parts[3] || '',
        description: '',
      }
    })
}

export default function BoardClient({ board: initialBoard, user }) {
  const router = useRouter()
  const toast = useToast()
  const [board, setBoard] = useState(initialBoard)
  const [view, setView] = useState('kanban')
  const [openCardId, setOpenCardId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteIdentifier, setInviteIdentifier] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteError, setInviteError] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [filters, setFilters] = useState(defaultFilters)
  const [editingBoardTitle, setEditingBoardTitle] = useState(false)
  const [boardTitleDraft, setBoardTitleDraft] = useState(initialBoard.title || '')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const openCard = board.cards.find(c => c.id === openCardId)
  const currentMember = board.members?.find(m => m.userId === user?.id)
  const currentRole = currentMember?.role || 'viewer'
  const canWrite = ['owner', 'admin', 'editor'].includes(currentRole)
  const canAdmin = ['owner', 'admin'].includes(currentRole)
  const isOwner = currentRole === 'owner'
  const today = startOfToday()
  const weekEnd = addDays(today, 7)
  const longOverdueCutoff = addDays(today, -7)
  const boardLabelDefs = board.labels?.length ? board.labels : DEFAULT_LABEL_DEFS
  const unknownLabelDefs = board.cards
    .flatMap(card => card.labels || [])
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .filter(label => !boardLabelDefs.some(def => def.name === label))
    .map(label => ({ id:`unknown-${label}`, name:label, color:'#5865f2' }))
  const labelDefinitions = [...boardLabelDefs, ...unknownLabelDefs]
  const hasFilters = Object.entries(filters).some(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))
  const activeFilterCount = Object.entries(filters).reduce((count, [, value]) => count + (Array.isArray(value) ? value.length : value ? 1 : 0), 0)

  function cardDeadline(card) {
    return parseDeadline(card.deadline)
  }

  function isOverdue(card) {
    const deadline = cardDeadline(card)
    return deadline ? deadline < today : false
  }

  function isDueToday(card) {
    const deadline = cardDeadline(card)
    return deadline ? deadline.getTime() === today.getTime() : false
  }

  function isDueThisWeek(card) {
    const deadline = cardDeadline(card)
    return deadline ? deadline >= today && deadline <= weekEnd : false
  }

  function isLongOverdue(card) {
    const deadline = cardDeadline(card)
    return deadline ? deadline < longOverdueCutoff : false
  }

  function isMine(card) {
    return card.assignees?.some(a => a.userId === user?.id)
  }

  function matchesFilters(card) {
    const keyword = filters.keyword.trim().toLowerCase()
    if (keyword) {
      const columnTitle = board.columns.find(col => col.id === card.columnId)?.title || ''
      const haystack = [
        card.title,
        card.description,
        card.priority,
        columnTitle,
        ...(card.labels || []),
        ...(card.assignees || []).map(a => a.name),
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(keyword)) return false
    }

    const hasMemberFilter = filters.mine || filters.unassigned
    if (hasMemberFilter) {
      const memberMatch = (filters.mine && isMine(card)) || (filters.unassigned && !card.assignees?.length)
      if (!memberMatch) return false
    }

    const hasDueFilter = filters.overdue || filters.dueToday || filters.dueWeek || filters.noDue
    if (hasDueFilter) {
      const dueMatch =
        (filters.overdue && isOverdue(card)) ||
        (filters.dueToday && isDueToday(card)) ||
        (filters.dueWeek && isDueThisWeek(card)) ||
        (filters.noDue && !card.deadline)
      if (!dueMatch) return false
    }
    if (filters.priorities.length && !filters.priorities.includes(card.priority || 'medium')) return false
    if (filters.labels.length && !filters.labels.some(label => (card.labels || []).includes(label))) return false
    if (filters.columns.length && !filters.columns.includes(card.columnId)) return false
    return true
  }

  const visibleCards = hasFilters ? board.cards.filter(matchesFilters) : board.cards
  const reminderStats = {
    longOverdue: board.cards.filter(isLongOverdue),
    overdue: board.cards.filter(card => isOverdue(card) && !isLongOverdue(card)),
    dueToday: board.cards.filter(isDueToday),
    high: board.cards.filter(card => card.priority === 'high'),
    mine: board.cards.filter(isMine),
  }

  function setFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }))
  }

  function toggleFilterValue(key, value) {
    setFilters(current => {
      const values = current[key] || []
      return { ...current, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] }
    })
  }

  function activateQuickFilter(key) {
    setFilters(current => ({ ...current, [key]: true }))
  }

  function cardsByCol(colId) {
    return visibleCards.filter(c => c.columnId === colId).sort((a,b) => a.order - b.order)
  }

  async function handleMoveCard(cardId, toColId, order) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    setBoard(b => ({
      ...b,
      cards: b.cards.map(c => c.id === cardId ? { ...c, columnId: toColId, order } : c)
    }))
    await moveCard(board.id, cardId, toColId, order)
    router.refresh()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const activeColumn = board.columns.find(c => c.id === active.id)
    if (activeColumn) {
      if (!canWrite) return toast('Du hast nur Leserechte')

      const overColumn = board.columns.find(c => c.id === over.id)
      const overCard = board.cards.find(c => c.id === over.id)
      const overColumnId = overColumn?.id || overCard?.columnId
      if (!overColumnId || active.id === overColumnId) return

      const oldIndex = board.columns.findIndex(c => c.id === active.id)
      const newIndex = board.columns.findIndex(c => c.id === overColumnId)
      if (oldIndex < 0 || newIndex < 0) return

      const nextColumns = arrayMove(board.columns, oldIndex, newIndex).map((col, index) => ({ ...col, order: index }))
      setBoard(b => ({ ...b, columns: nextColumns }))
      await reorderColumns(board.id, nextColumns.map(col => col.id))
      router.refresh()
      return
    }

    const activeCard = board.cards.find(c => c.id === active.id)
    if (!activeCard) return

    const overCard   = board.cards.find(c => c.id === over.id)
    const overCol    = board.columns.find(c => c.id === over.id)
    const toColId    = overCard ? overCard.columnId : overCol?.id
    if (!toColId) return

    const colCards = board.cards.filter(c => c.columnId === toColId).sort((a,b) => a.order - b.order)
    const overIdx  = overCard ? colCards.findIndex(c => c.id === overCard.id) : colCards.length
    const newOrder = overIdx === 0
      ? (colCards[0]?.order || 1000) / 2
      : overIdx >= colCards.length
        ? (colCards[colCards.length-1]?.order || 0) + 1000
        : (colCards[overIdx-1].order + colCards[overIdx].order) / 2

    handleMoveCard(active.id, toColId, newOrder)
  }

  async function handleAddCard(colId, title) {
    if (!canWrite) throw new Error('Du hast nur Leserechte')
    const id = await addCard(board.id, colId, { title, priority:'medium' })
    toast('Karte erstellt')
    router.refresh()
    return id
  }

  async function handleDeleteBoard() {
    if (!isOwner) return toast('Nur der Owner kann das Board loeschen')
    if (!confirm('Board wirklich löschen?')) return
    await deleteBoard(board.id)
    router.push('/')
  }

  async function handleToggleShare() {
    if (!canAdmin) return toast('Keine Berechtigung')
    const token = await toggleShare(board.id)
    setBoard(b => ({ ...b, shareToken: token, isPublic: !!token }))
    if (token) {
      const url = `${window.location.origin}/share/${token}`
      try { await navigator.clipboard.writeText(url) } catch {}
      toast('Link kopiert: ' + url)
    } else {
      toast('Teilen deaktiviert')
    }
  }

  async function handleInviteMember(e) {
    e.preventDefault()
    setInviteError('')
    if (!inviteIdentifier.trim()) return
    const result = await addBoardMember(board.id, inviteIdentifier, inviteRole)
    if (!result?.ok) {
      setInviteError(result?.error || 'Mitglied konnte nicht hinzugefuegt werden')
      return
    }
    setInviteIdentifier('')
    setInviteRole('editor')
    toast('Mitglied hinzugefuegt')
    router.refresh()
  }

  async function handleRoleChange(memberUserId, role) {
    await updateBoardMemberRole(board.id, memberUserId, role)
    toast('Rolle aktualisiert')
    router.refresh()
  }

  async function handleRemoveMember(memberUserId) {
    await removeBoardMember(board.id, memberUserId)
    toast('Mitglied entfernt')
    router.refresh()
  }

  function openCardMenu(e, cardId) {
    e.preventDefault()
    e.stopPropagation()
    const width = 240
    const height = 330
    const x = Math.min(e.clientX, window.innerWidth - width - 12)
    const y = Math.min(e.clientY, window.innerHeight - height - 12)
    setContextMenu({ cardId, x: Math.max(12, x), y: Math.max(12, y) })
  }

  async function quickUpdateCard(cardId, data) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    setBoard(b => ({ ...b, cards: b.cards.map(c => c.id === cardId ? { ...c, ...data } : c) }))
    await updateCard(board.id, cardId, data)
    router.refresh()
  }

  async function quickDeleteCard(cardId) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    if (!confirm('Diese Karte wirklich loeschen?')) return
    setContextMenu(null)
    setBoard(b => ({ ...b, cards: b.cards.filter(c => c.id !== cardId) }))
    await deleteCard(board.id, cardId)
    toast('Karte geloescht')
    router.refresh()
  }

  async function quickToggleAssignee(cardId, member) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    const userInfo = member.user || {}
    const assignee = {
      cardId,
      userId: member.userId,
      name: userInfo.name || userInfo.email || 'Nutzer',
      image: userInfo.image,
    }

    setBoard(b => ({
      ...b,
      cards: b.cards.map(card => {
        if (card.id !== cardId) return card
        const current = card.assignees || []
        const exists = current.some(item => item.userId === member.userId)
        return { ...card, assignees: exists ? current.filter(item => item.userId !== member.userId) : [...current, assignee] }
      })
    }))

    await toggleCardAssignee(board.id, cardId, member.userId)
    router.refresh()
  }

  function handleResizeColumn(columnId, width) {
    if (!canWrite) return
    const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)))
    setBoard(b => ({
      ...b,
      columns: b.columns.map(col => col.id === columnId ? { ...col, width: nextWidth } : col)
    }))
  }

  async function handleSaveColumnWidth(columnId, width) {
    if (!canWrite) return
    const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)))
    await updateColumnWidth(board.id, columnId, nextWidth)
    router.refresh()
  }

  async function handleCreateLabel(data) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    try {
      await createBoardLabel(board.id, data)
      toast('Label erstellt')
      router.refresh()
    } catch (error) {
      toast(error.message || 'Label konnte nicht erstellt werden')
    }
  }

  async function handleUpdateLabel(labelId, data) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    try {
      await updateBoardLabel(board.id, labelId, data)
      toast('Label aktualisiert')
      router.refresh()
    } catch (error) {
      toast(error.message || 'Label konnte nicht aktualisiert werden')
    }
  }

  async function handleDeleteLabel(labelId) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    if (!confirm('Label wirklich loeschen? Es wird auch von allen Karten entfernt.')) return
    try {
      await deleteBoardLabel(board.id, labelId)
      toast('Label geloescht')
      router.refresh()
    } catch (error) {
      toast(error.message || 'Label konnte nicht geloescht werden')
    }
  }

  async function handleImportCards(defaultColumnId, parsedCards) {
    if (!canWrite) return toast('Du hast nur Leserechte')
    const result = await importCards(board.id, defaultColumnId, parsedCards)
    toast(`${result.count} Karten importiert${result.createdColumns ? `, ${result.createdColumns} Spalte(n) erstellt` : ''}`)
    setImportOpen(false)
    router.refresh()
  }

  async function handleSaveBoardTitle() {
    if (!canWrite) return toast('Du hast nur Leserechte')
    const title = boardTitleDraft.trim()
    if (!title) {
      setBoardTitleDraft(board.title)
      setEditingBoardTitle(false)
      return toast('Board-Name ist erforderlich')
    }
    if (title === board.title) {
      setEditingBoardTitle(false)
      return
    }

    const previousTitle = board.title
    setBoard(current => ({ ...current, title }))
    setEditingBoardTitle(false)
    try {
      await updateBoard(board.id, { title })
      toast('Board umbenannt')
      router.refresh()
    } catch (error) {
      setBoard(current => ({ ...current, title: previousTitle }))
      setBoardTitleDraft(previousTitle)
      toast(error.message || 'Board konnte nicht umbenannt werden')
    }
  }

  const viewBtn = (v, label) => (
    <button onClick={() => setView(v)} style={{
      fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px',
      textTransform:'uppercase', padding:'6px 14px', borderRadius:'5px', border:'none',
      background: view===v ? 'rgba(88,101,242,.2)' : 'transparent',
      color: view===v ? '#9da5f3' : 'var(--dim)',
      border: view===v ? '1px solid rgba(88,101,242,.4)' : '1px solid transparent',
      cursor:'pointer', transition:'all .15s',
    }}>{label}</button>
  )

  const activeCard = board.cards.find(c => c.id === activeId)
  const activeColumn = board.columns.find(c => c.id === activeId)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 64px)' }} onClick={() => setContextMenu(null)}>
      {/* Board Header */}
      <div style={{
        height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', background:'var(--board-sub-bg)', borderBottom:'1px solid var(--bd2)', flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <button onClick={() => router.push('/')} style={{ background:'var(--ink4)', border:'1px solid var(--bd2)', borderRadius:'4px', color:'var(--dim)', width:'32px', height:'32px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', cursor:'pointer' }}>←</button>
          <div style={{ width:'4px', height:'4px', borderRadius:'50%', background:board.coverColor }} />
          {editingBoardTitle ? (
            <input
              value={boardTitleDraft}
              autoFocus
              onChange={e => setBoardTitleDraft(e.target.value)}
              onBlur={handleSaveBoardTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setBoardTitleDraft(board.title)
                  setEditingBoardTitle(false)
                }
              }}
              style={{
                width:'min(360px, 34vw)', padding:'5px 8px', borderRadius:'5px',
                border:'1px solid rgba(88,101,242,.45)', background:'var(--ink3)',
                color:'var(--td)', outline:'none', fontFamily:'var(--fd)', fontSize:'22px',
                letterSpacing:'1px',
              }}
            />
          ) : (
            <button
              type="button"
              disabled={!canWrite}
              title={canWrite ? 'Board umbenennen' : 'Nur mit Schreibrechten moeglich'}
              onClick={() => {
                if (!canWrite) return
                setBoardTitleDraft(board.title)
                setEditingBoardTitle(true)
              }}
              style={{
                padding:0, border:'none', background:'transparent',
                fontFamily:'var(--fd)', fontSize:'22px', letterSpacing:'1px',
                color:'var(--td)', cursor:canWrite ? 'text' : 'default',
              }}
            >
              {board.title}
            </button>
          )}
          <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)' }}>{board.cards.length} Aufgaben</span>
          <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', textTransform:'uppercase' }}>{currentRole}</span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {viewBtn('kanban','⊞ Board')}
          {viewBtn('calendar','≡ Kalender')}
          {viewBtn('timeline','→ Timeline')}
          {viewBtn('whiteboard','□ Whiteboard')}

          <div style={{ width:'1px', height:'20px', background:'var(--bd2)', margin:'0 4px' }} />

          <button onClick={() => setFiltersOpen(v => !v)} style={{
            fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
            padding:'6px 12px', borderRadius:'5px', cursor:'pointer', transition:'all .15s',
            background: filtersOpen || hasFilters ? 'rgba(88,101,242,.2)' : 'transparent',
            color: filtersOpen || hasFilters ? '#9da5f3' : 'var(--dim)',
            border: filtersOpen || hasFilters ? '1px solid rgba(88,101,242,.4)' : '1px solid var(--bd)',
          }}>
            Filter{activeFilterCount ? ` ${activeFilterCount}` : ''}
          </button>

          {canWrite && (
            <button onClick={() => setImportOpen(true)} style={{
              fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
              padding:'6px 12px', borderRadius:'5px', cursor:'pointer', transition:'all .15s',
              background: importOpen ? 'rgba(88,101,242,.2)' : 'transparent',
              color: importOpen ? '#9da5f3' : 'var(--dim)',
              border: importOpen ? '1px solid rgba(88,101,242,.4)' : '1px solid var(--bd)',
            }}>
              Import
            </button>
          )}

          <button onClick={handleToggleShare} style={{
            fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
            padding:'6px 12px', borderRadius:'5px', cursor:'pointer', transition:'all .15s',
            background: board.isPublic ? 'rgba(34,197,94,.1)' : 'transparent',
            color: board.isPublic ? '#4ade80' : 'var(--dim)',
            border: board.isPublic ? '1px solid rgba(34,197,94,.3)' : '1px solid var(--bd)',
          }}>
            {board.isPublic ? '🔗 Teilen' : '⬡ Teilen'}
          </button>

          <button onClick={() => setMembersOpen(v => !v)} style={{
            fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
            padding:'6px 12px', borderRadius:'5px', cursor:'pointer', background:'transparent',
            color: membersOpen ? '#9da5f3' : 'var(--dim)',
            border: membersOpen ? '1px solid rgba(88,101,242,.4)' : '1px solid var(--bd)',
          }}>
            Mitglieder
          </button>

          <button onClick={handleDeleteBoard} style={{
            fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
            padding:'6px 12px', borderRadius:'5px', cursor:'pointer', background:'transparent',
            color:'var(--faint)', border:'1px solid var(--bd)', transition:'all .15s',
          }}>Löschen</button>
        </div>
      </div>

      {membersOpen && (
        <div style={{
          borderBottom:'1px solid var(--bd2)', background:'var(--ink2)',
          padding:'14px 20px', display:'flex', gap:'14px', alignItems:'flex-start',
          justifyContent:'space-between', flexWrap:'wrap', overflow:'hidden',
        }}>
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center', minWidth:0, flex:'1 1 360px' }}>
            {board.members?.map(member => (
              <div key={member.id} style={{
                display:'flex', alignItems:'center', gap:'8px', padding:'7px 9px',
                border:'1px solid var(--bd2)', borderRadius:'6px', background:'var(--ink3)',
              }}>
                {member.user?.image
                  ? <img src={member.user.image} alt="" style={{ width:'24px', height:'24px', borderRadius:'50%' }} />
                  : <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:'var(--em)', color:'#fff', fontFamily:'var(--fd)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {(member.user?.name || member.user?.email || '?')[0].toUpperCase()}
                    </div>
                }
                <div>
                  <div style={{ fontFamily:'var(--fb)', fontSize:'12px', color:'var(--td)' }}>{member.user?.name || member.user?.email}</div>
                  <div style={{ fontFamily:'var(--fm)', fontSize:'9px', color:'var(--faint)' }}>{member.user?.email}</div>
                  {member.user?.accounts?.[0]?.providerAccountId && (
                    <div style={{ fontFamily:'var(--fm)', fontSize:'9px', color:'var(--faint)' }}>
                      ID: {member.user.accounts[0].providerAccountId}
                    </div>
                  )}
                </div>
                {canAdmin && member.role !== 'owner' ? (
                  <select value={member.role} onChange={e => handleRoleChange(member.userId, e.target.value)} style={{ padding:'5px 7px', fontSize:'11px' }}>
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Lesen</option>
                  </select>
                ) : (
                  <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', textTransform:'uppercase' }}>{member.role}</span>
                )}
                {canAdmin && member.role !== 'owner' && (
                  <button onClick={() => handleRemoveMember(member.userId)} style={{ background:'transparent', border:'none', color:'var(--faint)', fontSize:'16px' }}>x</button>
                )}
              </div>
            ))}
          </div>

          {canAdmin && (
            <form onSubmit={handleInviteMember} style={{
              display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap',
              minWidth:0, flex:'1 1 360px', maxWidth:'520px',
            }}>
              <input value={inviteIdentifier} onChange={e => setInviteIdentifier(e.target.value)} placeholder="Discord Name, User ID oder Email" type="text" style={{ flex:'1 1 220px', minWidth:0, padding:'8px 10px' }} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ flex:'0 0 112px', minWidth:0, padding:'8px 10px' }}>
                <option value="editor">Editor</option>
                <option value="viewer">Nur lesen</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" style={{ flex:'0 0 auto', padding:'8px 12px', border:'none', borderRadius:'5px', background:'var(--em)', color:'#fff', fontWeight:700 }}>
                Hinzufuegen
              </button>
              {inviteError && (
                <div style={{ flex:'1 1 100%', color:'#ef4444', fontFamily:'var(--fm)', fontSize:'11px' }}>
                  {inviteError}
                </div>
              )}
            </form>
          )}
        </div>
      )}

      <ReminderBar
        stats={reminderStats}
        activeFilters={filters}
        onActivate={activateQuickFilter}
        onPriority={() => toggleFilterValue('priorities', 'high')}
        onMine={() => activateQuickFilter('mine')}
      />

      {/* Board Content */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={e => setActiveId(e.active.id)} onDragEnd={handleDragEnd}>
          <div style={{ flex:1, display:'flex', overflowX:'auto', padding:'16px', gap:'12px', alignItems:'flex-start' }}>
            <SortableContext items={board.columns.map(col => col.id)} strategy={horizontalListSortingStrategy}>
              {board.columns.map(col => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  cards={cardsByCol(col.id)}
                  boardId={board.id}
                  labelDefinitions={labelDefinitions}
                  onAddCard={handleAddCard}
                  onOpenCard={setOpenCardId}
                  onOpenMenu={openCardMenu}
                  onResizeColumn={handleResizeColumn}
                  onSaveColumnWidth={handleSaveColumnWidth}
                  canWrite={canWrite}
                  onDeleteCol={() => {
                    if (!canWrite) return
                    if (!confirm(`Spalte "${col.title}" wirklich loeschen? Alle Karten darin werden ebenfalls geloescht.`)) return
                    deleteColumn(board.id, col.id).then(() => router.refresh())
                  }}
                />
              ))}
            </SortableContext>

            {/* Add Column */}
            {canWrite && <button onClick={async () => {
              const title = prompt('Spalten-Name:')
              if (title?.trim()) {
                await addColumn(board.id, title.trim())
                router.refresh()
                toast('Spalte erstellt')
              }
            }} style={{
              flexShrink:0, width:'200px', height:'44px',
              background:'rgba(237,234,227,.04)', border:'1px dashed var(--bd2)',
              borderRadius:'8px', color:'var(--faint)', fontFamily:'var(--fm)',
              fontSize:'11px', letterSpacing:'1px', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              transition:'all .15s',
            }}>
              + Spalte
            </button>}
          </div>

          <DragOverlay>
            {activeCard && (
              <div style={{
                background:'var(--ink2)', border:'1px solid var(--bd2)',
                borderRadius:'8px', padding:'12px 14px', width:'var(--col-w)',
                opacity:.9, transform:'rotate(2deg)',
                boxShadow:'0 16px 40px rgba(0,0,0,.5)',
              }}>
                <div style={{ fontFamily:'var(--fb)', fontSize:'14px', fontWeight:600, color:'var(--td)' }}>{activeCard.title}</div>
              </div>
            )}
            {!activeCard && activeColumn && (
              <div style={{
                background:'var(--ink2)', border:'1px solid var(--bd2)',
                borderRadius:'8px', padding:'13px 14px', width:'var(--col-w)',
                opacity:.9, transform:'rotate(1deg)',
                boxShadow:'0 16px 40px rgba(0,0,0,.5)',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)' }}>#</span>
                  <span style={{ fontFamily:'var(--fb)', fontSize:'14px', fontWeight:700, color:'var(--td)' }}>{activeColumn.title}</span>
                  <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', background:'var(--ink3)', border:'1px solid var(--bd)', borderRadius:'10px', padding:'1px 7px' }}>{cardsByCol(activeColumn.id).length}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {view === 'calendar' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--ink)' }}>
          <div style={{ fontFamily:'var(--fm)', fontSize:'13px', color:'var(--faint)' }}>Kalender kommt bald</div>
        </div>
      )}

      {view === 'timeline' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--ink)' }}>
          <div style={{ fontFamily:'var(--fm)', fontSize:'13px', color:'var(--faint)' }}>Timeline kommt bald</div>
        </div>
      )}

      {view === 'whiteboard' && (
        <WhiteboardView
          boardId={board.id}
          initialData={board.whiteboard?.data}
          canWrite={canWrite}
          toast={toast}
        />
      )}

      {filtersOpen && (
        <FilterPanel
          filters={filters}
          columns={board.columns}
          labels={labelDefinitions}
          visibleCount={visibleCards.length}
          totalCount={board.cards.length}
          canWrite={canWrite}
          onClose={() => setFiltersOpen(false)}
          onSetFilter={setFilter}
          onToggleValue={toggleFilterValue}
          onReset={() => setFilters(defaultFilters)}
          onCreateLabel={handleCreateLabel}
          onUpdateLabel={handleUpdateLabel}
          onDeleteLabel={handleDeleteLabel}
        />
      )}

      {importOpen && (
        <ImportCardsPanel
          columns={board.columns}
          onClose={() => setImportOpen(false)}
          onImport={handleImportCards}
        />
      )}

      {/* Card Modal */}
      {openCard && (
        <CardModal
          card={openCard}
          board={board}
          user={user}
          labelDefinitions={labelDefinitions}
          canWrite={canWrite}
          onClose={() => setOpenCardId(null)}
          onUpdate={async (cardId, data) => {
            if (!canWrite) return toast('Du hast nur Leserechte')
            setBoard(b => ({ ...b, cards: b.cards.map(c => c.id === cardId ? { ...c, ...data } : c) }))
            await updateCard(board.id, cardId, data)
            router.refresh()
          }}
          onDelete={async (cardId) => {
            if (!canWrite) return toast('Du hast nur Leserechte')
            if (!confirm('Diese Karte wirklich loeschen?')) return
            setOpenCardId(null)
            setBoard(b => ({ ...b, cards: b.cards.filter(c => c.id !== cardId) }))
            await deleteCard(board.id, cardId)
            toast('Karte gelöscht')
            router.refresh()
          }}
          onAddComment={async (cardId, text) => {
            await addComment(board.id, cardId, text)
            toast('Kommentar hinzugefügt')
            router.refresh()
          }}
          onUpdateChecklist={async (cardId, checklists) => {
            await updateChecklist(board.id, cardId, checklists)
            router.refresh()
          }}
          onToggleAssignee={(cardId, member) => quickToggleAssignee(cardId, member)}
        />
      )}

      {contextMenu && (
        <CardContextMenu
          card={board.cards.find(c => c.id === contextMenu.cardId)}
          x={contextMenu.x}
          y={contextMenu.y}
          canWrite={canWrite}
          boardMembers={board.members || []}
          onClose={() => setContextMenu(null)}
          onOpen={() => {
            setOpenCardId(contextMenu.cardId)
            setContextMenu(null)
          }}
          onPriority={(priority) => quickUpdateCard(contextMenu.cardId, { priority })}
          onToggleLabel={(label) => {
            const card = board.cards.find(c => c.id === contextMenu.cardId)
            if (!card) return
            const labels = card.labels || []
            const next = labels.includes(label) ? labels.filter(l => l !== label) : [...labels, label]
            quickUpdateCard(card.id, { labels: next })
          }}
          labelDefinitions={labelDefinitions}
          onToggleAssignee={(member) => quickToggleAssignee(contextMenu.cardId, member)}
          onDelete={() => quickDeleteCard(contextMenu.cardId)}
        />
      )}
    </div>
  )
}

// ── KanbanColumn ─────────────────────────────────────────────
function ReminderBar({ stats, activeFilters, onActivate, onPriority, onMine }) {
  const items = [
    { key:'longOverdue', label:'Laengst ueberfaellig', count:stats.longOverdue.length, active:activeFilters.overdue, onClick:() => onActivate('overdue'), tone:'danger' },
    { key:'overdue', label:'Ueberfaellig', count:stats.overdue.length, active:activeFilters.overdue, onClick:() => onActivate('overdue'), tone:'danger' },
    { key:'dueToday', label:'Heute faellig', count:stats.dueToday.length, active:activeFilters.dueToday, onClick:() => onActivate('dueToday'), tone:'warn' },
    { key:'high', label:'High Prio', count:stats.high.length, active:activeFilters.priorities.includes('high'), onClick:onPriority, tone:'danger' },
    { key:'mine', label:'Meine Karten', count:stats.mine.length, active:activeFilters.mine, onClick:onMine, tone:'info' },
  ].filter(item => item.count > 0)

  if (!items.length) return null

  return (
    <div style={{
      flexShrink:0, display:'flex', alignItems:'center', gap:'8px', padding:'9px 20px',
      background:'var(--ink)', borderBottom:'1px solid var(--bd2)', overflowX:'auto',
    }}>
      <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'1px', textTransform:'uppercase', flexShrink:0 }}>
        Aufmerksamkeit
      </span>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          style={{
            flexShrink:0, display:'flex', alignItems:'center', gap:'7px',
            padding:'6px 10px', borderRadius:'5px', cursor:'pointer',
            border:item.active ? '1px solid rgba(88,101,242,.55)' : '1px solid var(--bd2)',
            background:item.active ? 'rgba(88,101,242,.18)' : 'var(--ink2)',
            color:item.tone === 'danger' ? '#f87171' : item.tone === 'warn' ? '#facc15' : '#9da5f3',
            fontFamily:'var(--fm)', fontSize:'11px',
          }}
        >
          <span>{item.label}</span>
          <strong style={{ color:'var(--td)' }}>{item.count}</strong>
        </button>
      ))}
    </div>
  )
}

function FilterPanel({ filters, columns, labels, visibleCount, totalCount, canWrite, onClose, onSetFilter, onToggleValue, onReset, onCreateLabel, onUpdateLabel, onDeleteLabel }) {
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState('#5865f2')
  const [editingLabelId, setEditingLabelId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingColor, setEditingColor] = useState('#5865f2')
  const rowStyle = {
    display:'flex', alignItems:'center', gap:'10px', width:'100%',
    padding:'7px 0', color:'var(--dim)', fontFamily:'var(--fb)', fontSize:'13px',
  }
  const sectionStyle = {
    margin:'18px 0 7px', fontFamily:'var(--fm)', fontSize:'10px',
    color:'var(--faint)', letterSpacing:'1px', textTransform:'uppercase',
  }

  const CheckRow = ({ checked, label, onClick, color }) => (
    <button type="button" onClick={onClick} style={{ ...rowStyle, background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
      <span style={{
        width:'15px', height:'15px', borderRadius:'3px', flexShrink:0,
        border:checked ? '1px solid rgba(88,101,242,.8)' : '1px solid var(--bd2)',
        background:checked ? 'rgba(88,101,242,.35)' : 'transparent',
      }} />
      {color && <span style={{ width:'14px', height:'14px', borderRadius:'50%', background:color, flexShrink:0 }} />}
      <span style={{ color:checked ? 'var(--td)' : 'var(--dim)' }}>{label}</span>
    </button>
  )

  async function submitLabel(e) {
    e.preventDefault()
    if (!labelName.trim()) return
    await onCreateLabel({ name: labelName, color: labelColor })
    setLabelName('')
    setLabelColor('#5865f2')
  }

  function startEdit(label) {
    setEditingLabelId(label.id)
    setEditingName(label.name)
    setEditingColor(label.color)
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editingLabelId || !editingName.trim()) return
    await onUpdateLabel(editingLabelId, { name: editingName, color: editingColor })
    setEditingLabelId(null)
    setEditingName('')
    setEditingColor('#5865f2')
  }

  return (
    <aside
      onClick={e => e.stopPropagation()}
      style={{
        position:'fixed', top:'64px', right:0, bottom:0, width:'360px', zIndex:450,
        background:'var(--ink2)', borderLeft:'1px solid var(--bd2)',
        boxShadow:'-18px 0 50px rgba(0,0,0,.35)', padding:'18px',
        overflowY:'auto',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div>
          <div style={{ fontFamily:'var(--fd)', fontSize:'22px', letterSpacing:'1px', color:'var(--td)' }}>Filtern</div>
          <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)' }}>{visibleCount}/{totalCount} Karten sichtbar</div>
        </div>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--faint)', fontSize:'18px', cursor:'pointer' }}>x</button>
      </div>

      <div style={sectionStyle}>Stichwort</div>
      <input
        autoFocus
        value={filters.keyword}
        onChange={e => onSetFilter('keyword', e.target.value)}
        placeholder="Karten, Labels, Mitglieder..."
        style={{
          width:'100%', padding:'10px 11px', borderRadius:'5px',
          border:'1px solid rgba(88,101,242,.5)', background:'var(--ink3)',
          color:'var(--td)', outline:'none',
        }}
      />

      <div style={sectionStyle}>Mitglieder</div>
      <CheckRow checked={filters.unassigned} label="Keine Mitglieder" onClick={() => onSetFilter('unassigned', !filters.unassigned)} />
      <CheckRow checked={filters.mine} label="Karten, die mir zugewiesen sind" onClick={() => onSetFilter('mine', !filters.mine)} />

      <div style={sectionStyle}>Faelligkeit</div>
      <CheckRow checked={filters.noDue} label="Ohne Faelligkeitsdatum" onClick={() => onSetFilter('noDue', !filters.noDue)} />
      <CheckRow checked={filters.overdue} label="Ueberfaellig" onClick={() => onSetFilter('overdue', !filters.overdue)} color="#ef4444" />
      <CheckRow checked={filters.dueToday} label="Heute faellig" onClick={() => onSetFilter('dueToday', !filters.dueToday)} color="#eab308" />
      <CheckRow checked={filters.dueWeek} label="Innerhalb der naechsten Woche" onClick={() => onSetFilter('dueWeek', !filters.dueWeek)} color="#8b949e" />

      <div style={sectionStyle}>Prioritaet</div>
      {Object.entries(PRIORITIES).map(([key, priority]) => (
        <CheckRow key={key} checked={filters.priorities.includes(key)} label={priority.label} color={priority.color} onClick={() => onToggleValue('priorities', key)} />
      ))}

      <div style={sectionStyle}>Labels</div>
      {labels.map(label => (
        <CheckRow key={label.id || label.name} checked={filters.labels.includes(label.name)} label={label.name} color={label.color} onClick={() => onToggleValue('labels', label.name)} />
      ))}

      {canWrite && (
        <div style={{ marginTop:'10px', padding:'10px', border:'1px solid var(--bd2)', borderRadius:'6px', background:'var(--ink3)' }}>
          <form onSubmit={submitLabel} style={{ display:'grid', gridTemplateColumns:'1fr 34px 34px', gap:'7px', alignItems:'center' }}>
            <input
              value={labelName}
              onChange={e => setLabelName(e.target.value)}
              placeholder="Neues Label"
              style={{
                minWidth:0, padding:'8px 9px', borderRadius:'5px',
                border:'1px solid var(--bd2)', background:'var(--ink2)', color:'var(--td)',
              }}
            />
            <input
              type="color"
              value={labelColor}
              onChange={e => setLabelColor(e.target.value)}
              title="Farbe"
              style={{ width:'34px', height:'34px', padding:'2px', border:'1px solid var(--bd2)', borderRadius:'5px', background:'var(--ink2)' }}
            />
            <button type="submit" title="Label erstellen" style={{
              width:'34px', height:'34px', border:'1px solid var(--bd2)', borderRadius:'5px',
              background:'rgba(88,101,242,.25)', color:'#9da5f3', cursor:'pointer',
            }}>+</button>
          </form>

          <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginTop:'10px' }}>
            {labels.filter(label => {
              const id = String(label.id || '')
              return !id.startsWith('unknown-') && !id.startsWith('default-')
            }).map(label => (
              editingLabelId === label.id ? (
                <form key={label.id} onSubmit={saveEdit} style={{ display:'grid', gridTemplateColumns:'1fr 34px 34px', gap:'7px', alignItems:'center' }}>
                  <input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    style={{
                      minWidth:0, padding:'7px 8px', borderRadius:'5px',
                      border:'1px solid var(--bd2)', background:'var(--ink2)', color:'var(--td)',
                    }}
                  />
                  <input
                    type="color"
                    value={editingColor}
                    onChange={e => setEditingColor(e.target.value)}
                    style={{ width:'34px', height:'32px', padding:'2px', border:'1px solid var(--bd2)', borderRadius:'5px', background:'var(--ink2)' }}
                  />
                  <button type="submit" title="Speichern" style={{ width:'34px', height:'32px', border:'1px solid var(--bd2)', borderRadius:'5px', background:'var(--ink2)', color:'var(--td)', cursor:'pointer' }}>OK</button>
                </form>
              ) : (
                <div key={label.id} style={{ display:'grid', gridTemplateColumns:'14px 1fr 26px 26px', gap:'7px', alignItems:'center' }}>
                  <span style={{ width:'14px', height:'14px', borderRadius:'50%', background:label.color }} />
                  <span style={{ minWidth:0, color:'var(--dim)', fontFamily:'var(--fb)', fontSize:'12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label.name}</span>
                  <button type="button" title="Bearbeiten" onClick={() => startEdit(label)} style={{ width:'26px', height:'26px', border:'1px solid var(--bd2)', borderRadius:'5px', background:'var(--ink2)', color:'var(--faint)', cursor:'pointer' }}>e</button>
                  <button type="button" title="Loeschen" onClick={() => onDeleteLabel(label.id)} style={{ width:'26px', height:'26px', border:'1px solid rgba(239,68,68,.3)', borderRadius:'5px', background:'var(--ink2)', color:'#f87171', cursor:'pointer' }}>x</button>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <div style={sectionStyle}>Spalten</div>
      {columns.map(column => (
        <CheckRow key={column.id} checked={filters.columns.includes(column.id)} label={column.title} onClick={() => onToggleValue('columns', column.id)} />
      ))}

      <button
        onClick={onReset}
        style={{
          width:'100%', marginTop:'18px', padding:'9px 11px', borderRadius:'5px',
          border:'1px solid var(--bd2)', background:'var(--ink3)', color:'var(--dim)',
          fontFamily:'var(--fb)', fontSize:'13px', cursor:'pointer',
        }}
      >
        Filter zuruecksetzen
      </button>
    </aside>
  )
}

function ImportCardsPanel({ columns, onClose, onImport }) {
  const [targetColumnId, setTargetColumnId] = useState(columns[0]?.id || '')
  const [rawInput, setRawInput] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  let previewCards = []
  let parseError = ''
  try {
    previewCards = parseImportedCards(rawInput)
  } catch (err) {
    parseError = err.message || 'Import konnte nicht gelesen werden'
  }

  const example = `{
  "cards": [
    {
      "title": "Login Flow testen",
      "description": "Discord Login pruefen und Fehlerfaelle dokumentieren",
      "priority": "high",
      "labels": ["qa", "auth"],
      "deadline": "2026-07-01",
      "column": "Neue Spalte oder vorhandener Spaltentitel",
      "checklists": [
        {
          "title": "Testplan",
          "items": [
            "Discord Login mit bestehendem Account testen",
            { "text": "Fehlerfall dokumentieren", "checked": false }
          ]
        }
      ]
    }
  ]
}`

  async function submitImport(e) {
    e.preventDefault()
    setError('')
    if (parseError) return setError(parseError)
    if (!previewCards.length) return setError('Keine gueltigen Karten erkannt')
    setImporting(true)
    try {
      await onImport(targetColumnId, previewCards)
    } catch (err) {
      setError(err.message || 'Import fehlgeschlagen')
    } finally {
      setImporting(false)
    }
  }

  return (
    <aside
      onClick={e => e.stopPropagation()}
      style={{
        position:'fixed', top:'64px', right:0, bottom:0, width:'430px', zIndex:460,
        background:'var(--ink2)', borderLeft:'1px solid var(--bd2)',
        boxShadow:'-18px 0 50px rgba(0,0,0,.35)', padding:'18px',
        overflowY:'auto',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
        <div>
          <div style={{ fontFamily:'var(--fd)', fontSize:'22px', letterSpacing:'1px', color:'var(--td)' }}>Cards importieren</div>
          <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)' }}>
            JSON oder einfache Textliste einfuegen. Neue Spalten werden aus "column" automatisch erstellt.
          </div>
        </div>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--faint)', fontSize:'18px', cursor:'pointer' }}>x</button>
      </div>

      <form onSubmit={submitImport}>
        <label style={importLabelStyle}>Zielspalte fuer Karten ohne Spalte</label>
        <select value={targetColumnId} onChange={e => setTargetColumnId(e.target.value)} style={importInputStyle}>
          {columns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}
        </select>

        <label style={{ ...importLabelStyle, marginTop:'14px' }}>Import-Text</label>
        <textarea
          value={rawInput}
          onChange={e => setRawInput(e.target.value)}
          placeholder="JSON oder Liste einfuegen..."
          style={{ ...importInputStyle, minHeight:'240px', resize:'vertical', lineHeight:1.45, fontFamily:'var(--fm)', fontSize:'12px' }}
        />

        <div style={{ marginTop:'10px', padding:'10px', border:'1px solid var(--bd2)', borderRadius:'6px', background:'var(--ink3)' }}>
          <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'7px' }}>
            Beispiel fuer KI-Prompt
          </div>
          <pre style={{ whiteSpace:'pre-wrap', fontFamily:'var(--fm)', fontSize:'10px', color:'var(--dim)', lineHeight:1.5 }}>
{`Gib mir Aufgaben als JSON in genau diesem Format:
${example}`}
          </pre>
        </div>

        <div style={{ marginTop:'12px', fontFamily:'var(--fm)', fontSize:'11px', color:parseError || error ? '#f87171' : 'var(--faint)' }}>
          {error || parseError || `${previewCards.length} Karten erkannt`}
        </div>

        {previewCards.length > 0 && !parseError && (
          <div style={{ marginTop:'10px', maxHeight:'150px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'6px' }}>
            {previewCards.slice(0, 8).map((card, index) => (
              <div key={`${card.title}-${index}`} style={{ padding:'7px 9px', border:'1px solid var(--bd2)', borderRadius:'5px', background:'var(--ink3)' }}>
                <div style={{ fontFamily:'var(--fb)', fontSize:'12px', color:'var(--td)' }}>{card.title}</div>
                <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)' }}>
                  {card.priority} {card.labels?.length ? `· ${card.labels.join(', ')}` : ''} {card.deadline ? `· ${card.deadline}` : ''}
                  {card.checklists?.length ? ` · ${card.checklists.length} Checkliste(n)` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={importing || !previewCards.length || Boolean(parseError)}
          style={{
            width:'100%', marginTop:'14px', padding:'10px 12px', borderRadius:'5px',
            border:'1px solid rgba(88,101,242,.45)', background:'rgba(88,101,242,.35)',
            color:'#fff', fontFamily:'var(--fb)', fontSize:'13px',
            cursor:importing || !previewCards.length || parseError ? 'not-allowed' : 'pointer',
            opacity:importing || !previewCards.length || parseError ? .55 : 1,
          }}
        >
          {importing ? 'Importiere...' : `${previewCards.length || 0} Karten importieren`}
        </button>
      </form>
    </aside>
  )
}

const importLabelStyle = {
  display:'block', fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)',
  letterSpacing:'1px', textTransform:'uppercase', marginBottom:'7px',
}

const importInputStyle = {
  width:'100%', padding:'9px 10px', borderRadius:'5px',
  border:'1px solid var(--bd2)', background:'var(--ink3)', color:'var(--td)', outline:'none',
}

function KanbanColumn({ col, cards, boardId, labelDefinitions, onAddCard, onOpenCard, onResizeColumn, onSaveColumnWidth, onOpenMenu, onDeleteCol, canWrite }) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const columnWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, col.width || 300))
  const {
    attributes,
    listeners,
    setNodeRef: setColumnNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id, data: { type:'column' }, disabled: !canWrite })
  const { setNodeRef: setCardsNodeRef } = useDroppable({ id: col.id, data: { type:'column-drop' } })

  async function submitCard(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    await onAddCard(col.id, newTitle.trim())
    setNewTitle(''); setAdding(false)
  }

  function startResize(e) {
    if (!canWrite) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = columnWidth
    let latestWidth = startWidth

    const onMove = (moveEvent) => {
      latestWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX))
      onResizeColumn(col.id, latestWidth)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onSaveColumnWidth(col.id, latestWidth)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once:true })
  }

  return (
    <div ref={setColumnNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? .5 : 1,
      flexShrink:0, width:`${columnWidth}px`, minWidth:`${MIN_COLUMN_WIDTH}px`, maxWidth:`${MAX_COLUMN_WIDTH}px`,
      background:'var(--ink2)', borderRadius:'8px',
      display:'flex', flexDirection:'column', maxHeight:'100%', position:'relative',
    }}>
      {/* Column Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 14px', borderBottom:'1px solid var(--bd)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <button
            type="button"
            title="Spalte verschieben"
            disabled={!canWrite}
            {...attributes}
            {...listeners}
            style={{
              width:'18px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center',
              background:'transparent', border:'1px solid transparent', borderRadius:'4px',
              color:'var(--faint)', fontFamily:'var(--fm)', fontSize:'11px',
              cursor:canWrite ? 'grab' : 'default', padding:0, flexShrink:0,
            }}
          >
            #
          </button>
          <span style={{ fontFamily:'var(--fb)', fontSize:'14px', fontWeight:700, color:'var(--td)' }}>{col.title}</span>
          <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', background:'var(--ink3)', border:'1px solid var(--bd)', borderRadius:'10px', padding:'1px 7px' }}>{cards.length}</span>
        </div>
        <div style={{ display:'flex', gap:'6px' }}>
          {canWrite && <button onClick={() => setAdding(true)} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:'14px', padding:'2px 5px' }}>+</button>}
          {canWrite && <button onClick={onDeleteCol} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:'11px', padding:'2px 5px' }}>···</button>}
        </div>
      </div>

      {/* Cards */}
      <div ref={setCardsNodeRef} style={{ flex:1, overflowY:'auto', padding:'8px', display:'flex', flexDirection:'column', gap:'6px', minHeight:'40px' }}>
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <SortableCard key={card.id} card={card} labelDefinitions={labelDefinitions} onOpen={() => onOpenCard(card.id)} onOpenMenu={onOpenMenu} canWrite={canWrite} />
          ))}
        </SortableContext>

        {cards.length === 0 && !adding && (
          <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', textAlign:'center', padding:'20px 0', opacity:.5 }}>Leer</div>
        )}
      </div>

      {/* Add Card Form */}
      {adding ? (
        <form onSubmit={submitCard} style={{ padding:'8px' }}>
          <textarea
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Kartenname eingeben..."
            style={{
              width:'100%', minHeight:'70px', padding:'9px', resize:'none',
              background:'var(--ink3)', border:'1px solid var(--em-bd)',
              borderRadius:'6px', color:'var(--td)', fontFamily:'var(--fb)', fontSize:'13px', outline:'none',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCard(e) } if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
          />
          <div style={{ display:'flex', gap:'6px', marginTop:'6px' }}>
            <button type="submit" style={{ flex:1, padding:'7px', background:'rgba(88,101,242,.85)', border:'none', borderRadius:'5px', color:'#fff', fontFamily:'var(--fb)', fontWeight:600, fontSize:'12px' }}>
              Karte hinzufügen
            </button>
            <button type="button" onClick={() => { setAdding(false); setNewTitle('') }} style={{ padding:'7px 10px', background:'transparent', border:'1px solid var(--bd2)', borderRadius:'5px', color:'var(--dim)', fontSize:'13px', cursor:'pointer' }}>×</button>
          </div>
        </form>
      ) : canWrite ? (
        <button onClick={() => setAdding(true)} style={{
          margin:'6px 8px 8px', padding:'8px', background:'transparent',
          border:'1px dashed var(--bd2)', borderRadius:'6px', color:'var(--faint)',
          fontFamily:'var(--fm)', fontSize:'11px', cursor:'pointer', transition:'all .15s',
        }}>
          + Karte hinzufügen
        </button>
      ) : null}

      {canWrite && (
        <div
          onPointerDown={startResize}
          title="Spaltenbreite ziehen"
          style={{
            position:'absolute', right:'-5px', top:'42px', bottom:'8px', width:'10px',
            cursor:'col-resize', zIndex:5, display:'flex', justifyContent:'center',
          }}
        >
          <div style={{ width:'2px', height:'100%', borderRadius:'2px', background:'rgba(237,234,227,.10)' }} />
        </div>
      )}
    </div>
  )
}

// ── SortableCard ─────────────────────────────────────────────
function SortableCard({ card, labelDefinitions, onOpen, onOpenMenu, canWrite }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type:'card' }, disabled: !canWrite })
  const p = PRIORITIES[card.priority] || PRIORITIES.medium
  const isOD = card.deadline && new Date(card.deadline) < new Date()
  const labelDefByName = new Map(labelDefinitions.map(label => [label.name, label]))

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition, opacity: isDragging ? 0 : 1,
      }}
    >
      <div
        onClick={onOpen}
        onContextMenu={e => onOpenMenu(e, card.id)}
        {...attributes} {...listeners}
        style={{
          background:'var(--ink3)', border:'1px solid var(--bd)',
          borderRadius:'8px', padding:'12px 14px', cursor:canWrite ? 'pointer' : 'default',
          transition:'border-color .15s, background .15s',
          ...(card.coverColor ? { borderTop:`3px solid ${card.coverColor}` } : {}),
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='var(--bd2)'; e.currentTarget.style.background='var(--ink4)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--bd)'; e.currentTarget.style.background='var(--ink3)' }}
      >
        {card.labels?.length > 0 && (
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'6px' }}>
            {card.labels.map(l => {
              const label = labelDefByName.get(l) || { name:l, color:'#5865f2' }
              return (
                <span key={l} style={{
                  fontFamily:'var(--fm)', fontSize:'9px', padding:'2px 6px', borderRadius:'3px',
                  background:hexToRgba(label.color, .18), color:label.color,
                  border:`1px solid ${hexToRgba(label.color, .35)}`,
                }}>{l}</span>
              )
            })}
          </div>
        )}
        <div style={{ fontFamily:'var(--fb)', fontSize:'14px', fontWeight:600, color:'var(--td)', lineHeight:1.4, marginBottom:'8px' }}>
          {card.title}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'var(--fm)', fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'3px', background:p.bg, color:p.color, border:`1px solid ${p.border}` }}>
            {p.label}
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            {card.assignees?.length > 0 && (
              <div style={{ display:'flex', alignItems:'center' }}>
                {card.assignees.slice(0, 3).map((assignee, index) => (
                  assignee.image
                    ? <img key={assignee.userId} src={assignee.image} alt="" title={assignee.name} style={{ width:'20px', height:'20px', borderRadius:'50%', border:'1px solid var(--ink3)', marginLeft:index ? '-6px' : 0 }} />
                    : <div key={assignee.userId} title={assignee.name} style={{ width:'20px', height:'20px', borderRadius:'50%', border:'1px solid var(--ink3)', marginLeft:index ? '-6px' : 0, background:'var(--em)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fd)', fontSize:'10px' }}>
                        {(assignee.name || '?')[0].toUpperCase()}
                      </div>
                ))}
              </div>
            )}
            {card.deadline && (
              <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color: isOD ? '#ef4444' : 'var(--faint)' }}>
                {isOD ? '! ' : ''}{new Date(card.deadline + 'T00:00:00').toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        </div>
        {card.checklists?.length > 0 && (
          <div style={{ marginTop:'7px', fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)' }}>
            ☑ {card.checklists.flatMap(cl => cl.items).filter(i => i.checked).length}/{card.checklists.flatMap(cl => cl.items).length}
          </div>
        )}
      </div>
    </div>
  )
}

function CardContextMenu({ card, x, y, canWrite, labelDefinitions, boardMembers, onClose, onOpen, onPriority, onToggleLabel, onToggleAssignee, onDelete }) {
  if (!card) return null
  const labels = card.labels || []
  const assignees = card.assignees || []

  return (
    <div
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
      style={{
        position:'fixed', left:x, top:y, zIndex:500, width:'240px',
        background:'var(--ink2)', border:'1px solid var(--bd2)', borderRadius:'8px',
        boxShadow:'0 18px 60px rgba(0,0,0,.45)', padding:'10px',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
        <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'1px', textTransform:'uppercase' }}>Schnell bearbeiten</div>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--faint)', fontSize:'14px' }}>x</button>
      </div>

      <button onClick={onOpen} style={menuButtonStyle}>Details oeffnen</button>

      <div style={menuSectionStyle}>Mitglieder</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'140px', overflowY:'auto' }}>
        {boardMembers.map(member => {
          const userInfo = member.user || {}
          const assigned = assignees.some(assignee => assignee.userId === member.userId)
          const name = userInfo.name || userInfo.email || 'Nutzer'
          return (
            <button
              key={member.userId}
              disabled={!canWrite}
              onClick={() => onToggleAssignee(member)}
              style={{
                display:'grid', gridTemplateColumns:'22px 1fr 18px', gap:'8px', alignItems:'center',
                padding:'6px 7px', borderRadius:'5px', cursor:canWrite ? 'pointer' : 'not-allowed',
                border: assigned ? '1px solid rgba(88,101,242,.55)' : '1px solid var(--bd2)',
                background: assigned ? 'rgba(88,101,242,.18)' : 'var(--ink3)',
                color: assigned ? 'var(--td)' : 'var(--dim)', textAlign:'left',
              }}
            >
              {userInfo.image
                ? <img src={userInfo.image} alt="" style={{ width:'22px', height:'22px', borderRadius:'50%' }} />
                : <span style={{ width:'22px', height:'22px', borderRadius:'50%', background:'var(--em)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fd)', fontSize:'10px' }}>{name[0].toUpperCase()}</span>
              }
              <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--fb)', fontSize:'12px' }}>{name}</span>
              <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:assigned ? '#9da5f3' : 'var(--faint)' }}>{assigned ? 'x' : '+'}</span>
            </button>
          )
        })}
      </div>

      <div style={menuSectionStyle}>Prioritaet</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
        {Object.entries(PRIORITIES).map(([key, p]) => (
          <button
            key={key}
            disabled={!canWrite}
            onClick={() => onPriority(key)}
            style={{
              padding:'6px 4px', borderRadius:'5px', cursor:canWrite ? 'pointer' : 'not-allowed',
              border: card.priority === key ? `1px solid ${p.color}` : '1px solid var(--bd2)',
              background:p.bg, color:p.color, fontFamily:'var(--fm)', fontSize:'10px',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={menuSectionStyle}>Tags</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
        {labelDefinitions.map(label => (
          <button
            key={label.id || label.name}
            disabled={!canWrite}
            onClick={() => onToggleLabel(label.name)}
            style={{
              display:'flex', alignItems:'center', gap:'5px',
              padding:'4px 8px', borderRadius:'4px', cursor:canWrite ? 'pointer' : 'not-allowed',
              border: labels.includes(label.name) ? `1px solid ${hexToRgba(label.color, .55)}` : '1px solid var(--bd2)',
              background: labels.includes(label.name) ? hexToRgba(label.color, .20) : 'var(--ink3)',
              color: labels.includes(label.name) ? label.color : 'var(--dim)',
              fontFamily:'var(--fm)', fontSize:'10px',
            }}
          >
            <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:label.color }} />
            {label.name}
          </button>
        ))}
      </div>

      <button
        disabled={!canWrite}
        onClick={onDelete}
        style={{
          ...menuButtonStyle,
          marginTop:'10px',
          color:'rgba(239,68,68,.8)',
          borderColor:'rgba(239,68,68,.3)',
          cursor:canWrite ? 'pointer' : 'not-allowed',
        }}
      >
        Karte loeschen
      </button>
    </div>
  )
}

const menuButtonStyle = {
  width:'100%', padding:'8px 10px', background:'var(--ink3)',
  border:'1px solid var(--bd2)', borderRadius:'5px', color:'var(--dim)',
  fontFamily:'var(--fb)', fontSize:'13px', cursor:'pointer', textAlign:'left',
}

const menuSectionStyle = {
  fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)',
  letterSpacing:'1px', textTransform:'uppercase', margin:'12px 0 7px',
}
