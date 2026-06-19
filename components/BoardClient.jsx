'use client'
import { useState, useTransition, useOptimistic } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDroppable
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import {
  addCard, moveCard, deleteBoard, addColumn, deleteColumn, renameColumn,
  addComment, updateCard, deleteCard, toggleShare, updateChecklist
} from '@/lib/actions/boards'
import CardModal from './CardModal'

const PRIORITIES = {
  high:   { color:'#ef4444', bg:'rgba(239,68,68,.15)',   border:'rgba(239,68,68,.3)',  label:'High'   },
  medium: { color:'#eab308', bg:'rgba(234,179,8,.15)',   border:'rgba(234,179,8,.3)',  label:'Medium' },
  low:    { color:'#22c55e', bg:'rgba(34,197,94,.15)',   border:'rgba(34,197,94,.3)',  label:'Low'    },
}

export default function BoardClient({ board: initialBoard, user }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [board, setBoard] = useState(initialBoard)
  const [view, setView] = useState('kanban')
  const [openCardId, setOpenCardId] = useState(null)
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const openCard = board.cards.find(c => c.id === openCardId)

  function cardsByCol(colId) {
    return board.cards.filter(c => c.columnId === colId).sort((a,b) => a.order - b.order)
  }

  async function handleMoveCard(cardId, toColId, order) {
    setBoard(b => ({
      ...b,
      cards: b.cards.map(c => c.id === cardId ? { ...c, columnId: toColId, order } : c)
    }))
    await moveCard(board.id, cardId, toColId, order)
    router.refresh()
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

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
    const id = await addCard(board.id, colId, { title, priority:'medium' })
    toast('Karte erstellt')
    router.refresh()
    return id
  }

  async function handleDeleteBoard() {
    if (!confirm('Board wirklich löschen?')) return
    await deleteBoard(board.id)
    router.push('/')
  }

  async function handleToggleShare() {
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

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 64px)' }}>
      {/* Board Header */}
      <div style={{
        height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', background:'var(--board-sub-bg)', borderBottom:'1px solid var(--bd2)', flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <button onClick={() => router.push('/')} style={{ background:'var(--ink4)', border:'1px solid var(--bd2)', borderRadius:'4px', color:'var(--dim)', width:'32px', height:'32px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', cursor:'pointer' }}>←</button>
          <div style={{ width:'4px', height:'4px', borderRadius:'50%', background:board.coverColor }} />
          <span style={{ fontFamily:'var(--fd)', fontSize:'22px', letterSpacing:'1px', color:'var(--td)' }}>{board.title}</span>
          <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)' }}>{board.cards.length} Aufgaben</span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {viewBtn('kanban','⊞ Board')}
          {viewBtn('calendar','≡ Kalender')}
          {viewBtn('timeline','→ Timeline')}

          <div style={{ width:'1px', height:'20px', background:'var(--bd2)', margin:'0 4px' }} />

          <button onClick={handleToggleShare} style={{
            fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
            padding:'6px 12px', borderRadius:'5px', cursor:'pointer', transition:'all .15s',
            background: board.isPublic ? 'rgba(34,197,94,.1)' : 'transparent',
            color: board.isPublic ? '#4ade80' : 'var(--dim)',
            border: board.isPublic ? '1px solid rgba(34,197,94,.3)' : '1px solid var(--bd)',
          }}>
            {board.isPublic ? '🔗 Teilen' : '⬡ Teilen'}
          </button>

          <button onClick={handleDeleteBoard} style={{
            fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
            padding:'6px 12px', borderRadius:'5px', cursor:'pointer', background:'transparent',
            color:'var(--faint)', border:'1px solid var(--bd)', transition:'all .15s',
          }}>Löschen</button>
        </div>
      </div>

      {/* Board Content */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={e => setActiveId(e.active.id)} onDragEnd={handleDragEnd}>
          <div style={{ flex:1, display:'flex', overflowX:'auto', padding:'16px', gap:'12px', alignItems:'flex-start' }}>
            {board.columns.map(col => (
              <KanbanColumn
                key={col.id}
                col={col}
                cards={cardsByCol(col.id)}
                boardId={board.id}
                onAddCard={handleAddCard}
                onOpenCard={setOpenCardId}
                onDeleteCol={() => { deleteColumn(board.id, col.id).then(() => router.refresh()) }}
              />
            ))}

            {/* Add Column */}
            <button onClick={async () => {
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
            </button>
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
          </DragOverlay>
        </DndContext>
      )}

      {view === 'calendar' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--ink)' }}>
          <div style={{ fontFamily:'var(--fm)', fontSize:'13px', color:'var(--faint)' }}>// Kalender kommt bald</div>
        </div>
      )}

      {/* Card Modal */}
      {openCard && (
        <CardModal
          card={openCard}
          board={board}
          user={user}
          onClose={() => setOpenCardId(null)}
          onUpdate={async (cardId, data) => {
            setBoard(b => ({ ...b, cards: b.cards.map(c => c.id === cardId ? { ...c, ...data } : c) }))
            await updateCard(board.id, cardId, data)
            router.refresh()
          }}
          onDelete={async (cardId) => {
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
        />
      )}
    </div>
  )
}

// ── KanbanColumn ─────────────────────────────────────────────
function KanbanColumn({ col, cards, boardId, onAddCard, onOpenCard, onDeleteCol }) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const { setNodeRef } = useDroppable({ id: col.id })

  async function submitCard(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    await onAddCard(col.id, newTitle.trim())
    setNewTitle(''); setAdding(false)
  }

  return (
    <div style={{
      flexShrink:0, width:'var(--col-w)',
      background:'var(--ink2)', borderRadius:'8px',
      display:'flex', flexDirection:'column', maxHeight:'100%',
    }}>
      {/* Column Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 14px', borderBottom:'1px solid var(--bd)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)' }}>⠿</span>
          <span style={{ fontFamily:'var(--fb)', fontSize:'14px', fontWeight:700, color:'var(--td)' }}>{col.title}</span>
          <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', background:'var(--ink3)', border:'1px solid var(--bd)', borderRadius:'10px', padding:'1px 7px' }}>{cards.length}</span>
        </div>
        <div style={{ display:'flex', gap:'6px' }}>
          <button onClick={() => setAdding(true)} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:'14px', padding:'2px 5px' }}>+</button>
          <button onClick={onDeleteCol} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:'11px', padding:'2px 5px' }}>···</button>
        </div>
      </div>

      {/* Cards */}
      <div ref={setNodeRef} style={{ flex:1, overflowY:'auto', padding:'8px', display:'flex', flexDirection:'column', gap:'6px', minHeight:'40px' }}>
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <SortableCard key={card.id} card={card} onOpen={() => onOpenCard(card.id)} />
          ))}
        </SortableContext>

        {cards.length === 0 && !adding && (
          <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', textAlign:'center', padding:'20px 0', opacity:.5 }}>// leer</div>
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
      ) : (
        <button onClick={() => setAdding(true)} style={{
          margin:'6px 8px 8px', padding:'8px', background:'transparent',
          border:'1px dashed var(--bd2)', borderRadius:'6px', color:'var(--faint)',
          fontFamily:'var(--fm)', fontSize:'11px', cursor:'pointer', transition:'all .15s',
        }}>
          + Karte hinzufügen
        </button>
      )}
    </div>
  )
}

// ── SortableCard ─────────────────────────────────────────────
function SortableCard({ card, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const p = PRIORITIES[card.priority] || PRIORITIES.medium
  const isOD = card.deadline && new Date(card.deadline) < new Date()

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
        {...attributes} {...listeners}
        style={{
          background:'var(--ink3)', border:'1px solid var(--bd)',
          borderRadius:'8px', padding:'12px 14px', cursor:'pointer',
          transition:'border-color .15s, background .15s',
          ...(card.coverColor ? { borderTop:`3px solid ${card.coverColor}` } : {}),
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='var(--bd2)'; e.currentTarget.style.background='var(--ink4)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--bd)'; e.currentTarget.style.background='var(--ink3)' }}
      >
        {card.labels?.length > 0 && (
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'6px' }}>
            {card.labels.map(l => (
              <span key={l} style={{ fontFamily:'var(--fm)', fontSize:'9px', padding:'2px 6px', borderRadius:'3px', background:'rgba(88,101,242,.15)', color:'var(--em-l)', border:'1px solid rgba(88,101,242,.25)' }}>{l}</span>
            ))}
          </div>
        )}
        <div style={{ fontFamily:'var(--fb)', fontSize:'14px', fontWeight:600, color:'var(--td)', lineHeight:1.4, marginBottom:'8px' }}>
          {card.title}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'var(--fm)', fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'3px', background:p.bg, color:p.color, border:`1px solid ${p.border}` }}>
            {p.label}
          </span>
          {card.deadline && (
            <span style={{ fontFamily:'var(--fm)', fontSize:'10px', color: isOD ? '#ef4444' : 'var(--faint)' }}>
              {isOD ? '⚠ ' : ''}{new Date(card.deadline + 'T00:00:00').toLocaleDateString('de-DE')}
            </span>
          )}
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
