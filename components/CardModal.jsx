'use client'
import { useState } from 'react'
import { useToast } from '@/context/ToastContext'

const PRIORITIES = {
  high:   { color:'#ef4444', label:'Hoch'   },
  medium: { color:'#eab308', label:'Mittel' },
  low:    { color:'#22c55e', label:'Niedrig'},
}
const COVERS = ['','#5865f2','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#059669','#0f172a','#374151']

const S = {
  inp: { width:'100%', padding:'9px 11px', background:'var(--ink2)', border:'1px solid var(--bd2)', borderRadius:'5px', color:'var(--td)', fontFamily:'var(--fb)', fontSize:'14px', outline:'none' },
  sec: { fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' },
  btn: { width:'100%', padding:'8px 12px', background:'var(--ink4)', border:'1px solid var(--bd2)', borderRadius:'5px', color:'var(--dim)', fontFamily:'var(--fb)', fontSize:'13px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:'8px', transition:'all .15s' },
}

function hexToRgba(hex, alpha) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex || '') ? hex.slice(1) : '5865f2'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function CardModal({ card, board, user, labelDefinitions = [], canWrite = false, onClose, onUpdate, onDelete, onAddComment, onUpdateChecklist, onToggleAssignee }) {
  const toast = useToast()
  const [title,    setTitle]    = useState(card.title)
  const [desc,     setDesc]     = useState(card.description || '')
  const [priority, setPriority] = useState(card.priority || 'medium')
  const [labels,   setLabels]   = useState(card.labels || [])
  const [deadline, setDeadline] = useState(card.deadline || '')
  const [start,    setStart]    = useState(card.startDate || '')
  const [cover,    setCover]    = useState(card.coverColor || '')
  const [comment,  setComment]  = useState('')
  const [tab,      setTab]      = useState('comments')
  const [checklists, setChecklists] = useState(card.checklists || [])
  const [saving,   setSaving]   = useState(false)

  const colTitle = board.columns.find(c => c.id === card.columnId)?.title || ''

  async function save(field, value) {
    await onUpdate(card.id, { [field]: value })
  }

  async function handleComment(e) {
    e.preventDefault()
    if (!comment.trim()) return
    await onAddComment(card.id, comment.trim())
    setComment('')
  }

  function toggleLabel(l) {
    const next = labels.includes(l) ? labels.filter(x => x !== l) : [...labels, l]
    setLabels(next)
    save('labels', next)
  }

  async function addChecklist() {
    const title = prompt('Checklisten-Name:')
    if (!title?.trim()) return
    const next = [...checklists, { id: 'cl-'+Date.now(), title, items: [], order: checklists.length }]
    setChecklists(next)
    await onUpdateChecklist(card.id, next)
  }

  async function addChecklistItem(clId, text) {
    const next = checklists.map(cl =>
      cl.id === clId
        ? { ...cl, items: [...cl.items, { id: 'ci-'+Date.now(), text, checked: false, order: cl.items.length }] }
        : cl
    )
    setChecklists(next)
    await onUpdateChecklist(card.id, next)
  }

  async function toggleItem(clId, itemId) {
    const next = checklists.map(cl =>
      cl.id === clId
        ? { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) }
        : cl
    )
    setChecklists(next)
    await onUpdateChecklist(card.id, next)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        {/* Header */}
        {cover && <div style={{ height:'6px', background:cover, borderRadius:'6px 6px 0 0' }} />}
        <div style={{ display:'flex', minHeight:0, height:'100%' }}>
          {/* Main */}
          <div style={{ flex:1, padding:'28px 22px 28px 28px', borderRight:'1px solid var(--bd)', minWidth:0, overflowY:'auto' }}>
            <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)', marginBottom:'10px' }}>
              In: {colTitle}
            </div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => save('title', title)}
              style={{ ...S.inp, fontFamily:'var(--fd)', fontSize:'26px', letterSpacing:'.5px', marginBottom:'16px', borderColor:'var(--em-bd)' }}
            />

            {/* Priority badge */}
            <div style={{ marginBottom:'16px' }}>
              <span style={{ fontFamily:'var(--fm)', fontSize:'11px', fontWeight:600, padding:'3px 10px', borderRadius:'4px', background:PRIORITIES[priority].color + '25', color:PRIORITIES[priority].color, border:`1px solid ${PRIORITIES[priority].color}55` }}>
                {PRIORITIES[priority].label}
              </span>
            </div>

            {/* Description */}
            <div style={S.sec}>— Beschreibung</div>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onBlur={() => save('description', desc)}
              placeholder="Beschreibung hinzufügen..."
              style={{ ...S.inp, minHeight:'170px', maxHeight:'min(55vh, 520px)', resize:'vertical', marginBottom:'20px', lineHeight:1.45 }}
            />

            {/* Checklists */}
            {checklists.map(cl => {
              const done = cl.items.filter(i => i.checked).length
              const pct  = cl.items.length ? Math.round(done/cl.items.length*100) : 0
              return (
                <div key={cl.id} style={{ marginBottom:'16px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                    <span style={{ fontFamily:'var(--fb)', fontWeight:600, color:'var(--td)', fontSize:'14px' }}>☑ {cl.title}</span>
                    <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)' }}>{pct}%</span>
                  </div>
                  <div style={{ height:'3px', background:'var(--ink3)', borderRadius:'2px', marginBottom:'10px' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:'var(--em)', borderRadius:'2px', transition:'width .2s' }} />
                  </div>
                  {cl.items.map(item => (
                    <div key={item.id} onClick={() => toggleItem(cl.id, item.id)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', cursor:'pointer' }}>
                      <div style={{ width:'14px', height:'14px', border:'1px solid var(--bd3)', borderRadius:'3px', flexShrink:0, background: item.checked ? 'var(--em)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {item.checked && <span style={{ color:'#fff', fontSize:'9px' }}>✓</span>}
                      </div>
                      <span style={{ fontSize:'14px', color: item.checked ? 'var(--faint)' : 'var(--dim)', textDecoration: item.checked ? 'line-through' : 'none', lineHeight:1.5 }}>{item.text}</span>
                    </div>
                  ))}
                  <button onClick={async () => {
                    const t = prompt('Element:')
                    if (t?.trim()) await addChecklistItem(cl.id, t.trim())
                  }} style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', background:'none', border:'none', cursor:'pointer', marginTop:'6px', padding:'0' }}>
                    + Element hinzufügen
                  </button>
                </div>
              )
            })}

            {/* Comments / Activity Tabs */}
            <div style={{ display:'flex', gap:'0', marginBottom:'14px', borderBottom:'1px solid var(--bd)' }}>
              {['comments','activity'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding:'8px 16px', background:'none', border:'none', cursor:'pointer',
                  fontFamily:'var(--fm)', fontSize:'13px', fontWeight:600, letterSpacing:'.5px',
                  color: tab===t ? 'var(--td)' : 'var(--faint)',
                  borderBottom: tab===t ? '2px solid var(--em)' : '2px solid transparent',
                  textTransform:'uppercase',
                }}>
                  {t === 'comments' ? 'Kommentare' : 'Aktivität'}
                </button>
              ))}
            </div>

            {tab === 'comments' && (
              <div>
                {card.comments?.length === 0 && (
                  <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)', marginBottom:'12px' }}>Noch keine Kommentare.</div>
                )}
                {card.comments?.map(c => (
                  <div key={c.id} style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
                    <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'var(--em)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fd)', fontSize:'12px', color:'#fff', overflow:'hidden' }}>
                      {c.author?.image ? <img src={c.author.image} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (c.author?.name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--dim)', marginBottom:'3px' }}>
                        {c.author?.name || 'Nutzer'} · {new Date(c.createdAt).toLocaleDateString('de-DE')}
                      </div>
                      <div style={{ fontSize:'14px', color:'var(--dim)', lineHeight:1.65, background:'var(--ink4)', padding:'8px 12px', borderRadius:'6px' }}>
                        {c.text}
                      </div>
                    </div>
                  </div>
                ))}
                <form onSubmit={handleComment} style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginTop:'8px' }}>
                  <input
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Kommentar schreiben..."
                    style={{ ...S.inp, flex:1, padding:'10px 12px' }}
                  />
                  <button type="submit" disabled={!comment.trim()} style={{
                    padding:'10px 14px', background:'rgba(88,101,242,.85)', border:'none',
                    borderRadius:'5px', color:'#fff', fontFamily:'var(--fb)', fontWeight:700, fontSize:'13px',
                    cursor: comment.trim() ? 'pointer' : 'not-allowed', opacity: comment.trim() ? 1 : .4,
                  }}>Senden</button>
                </form>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div style={{ width:'220px', flexShrink:0, padding:'28px 20px', display:'flex', flexDirection:'column', gap:'20px', overflowY:'auto' }}>
            <button onClick={onClose} style={{ alignSelf:'flex-end', background:'var(--ink4)', border:'1px solid var(--bd2)', borderRadius:'5px', color:'var(--dim)', width:'28px', height:'28px', cursor:'pointer', fontSize:'14px' }}>×</button>

            {/* Priority */}
            <div>
              <div style={S.sec}>— Priorität</div>
              <select value={priority} onChange={e => { setPriority(e.target.value); save('priority', e.target.value) }}
                style={{ ...S.inp, padding:'8px' }}>
                <option value="high">Hoch</option>
                <option value="medium">Mittel</option>
                <option value="low">Niedrig</option>
              </select>
            </div>

            {/* Dates */}
            <div>
              <div style={S.sec}>— Startdatum</div>
              <input type="date" value={start} onChange={e => { setStart(e.target.value); save('startDate', e.target.value) }} style={{ ...S.inp, padding:'8px' }} />
            </div>
            <div>
              <div style={S.sec}>— Deadline</div>
              <input type="date" value={deadline} onChange={e => { setDeadline(e.target.value); save('deadline', e.target.value) }} style={{ ...S.inp, padding:'8px' }} />
            </div>

            {/* Members */}
            <div>
              <div style={S.sec}>— Mitglieder</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'160px', overflowY:'auto' }}>
                {board.members?.map(member => {
                  const userInfo = member.user || {}
                  const assigned = card.assignees?.some(assignee => assignee.userId === member.userId)
                  const name = userInfo.name || userInfo.email || 'Nutzer'
                  return (
                    <button
                      key={member.userId}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => onToggleAssignee(card.id, member)}
                      style={{
                        display:'grid', gridTemplateColumns:'24px 1fr 18px', alignItems:'center', gap:'8px',
                        padding:'6px 7px', borderRadius:'5px', cursor:canWrite ? 'pointer' : 'not-allowed',
                        border:assigned ? '1px solid rgba(88,101,242,.55)' : '1px solid var(--bd2)',
                        background:assigned ? 'rgba(88,101,242,.18)' : 'var(--ink4)',
                        color:assigned ? 'var(--td)' : 'var(--dim)', textAlign:'left',
                      }}
                    >
                      {userInfo.image
                        ? <img src={userInfo.image} alt="" style={{ width:'24px', height:'24px', borderRadius:'50%' }} />
                        : <span style={{ width:'24px', height:'24px', borderRadius:'50%', background:'var(--em)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fd)', fontSize:'11px' }}>{name[0].toUpperCase()}</span>
                      }
                      <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--fb)', fontSize:'12px' }}>{name}</span>
                      <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:assigned ? '#9da5f3' : 'var(--faint)' }}>{assigned ? 'x' : '+'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Labels */}
            <div>
              <div style={S.sec}>— Labels</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                {labelDefinitions.map(label => (
                  <button key={label.id || label.name} onClick={() => toggleLabel(label.name)} style={{
                    display:'flex', alignItems:'center', gap:'5px',
                    fontFamily:'var(--fm)', fontSize:'10px', padding:'3px 8px', borderRadius:'3px', cursor:'pointer',
                    border: labels.includes(label.name) ? `1px solid ${hexToRgba(label.color, .55)}` : '1px solid var(--bd2)',
                    background: labels.includes(label.name) ? hexToRgba(label.color, .20) : 'var(--ink4)',
                    color: labels.includes(label.name) ? label.color : 'var(--faint)',
                    transition:'all .15s',
                  }}>
                    <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:label.color }} />
                    {label.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Cover */}
            <div>
              <div style={S.sec}>— Cover-Farbe</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                {COVERS.map(c => (
                  <button key={c} onClick={() => { setCover(c); save('coverColor', c) }} style={{
                    width:'22px', height:'22px', borderRadius:'50%', border:'none', cursor:'pointer',
                    background: c || 'transparent',
                    border: c === '' ? '1px dashed var(--bd3)' : cover===c ? `2px solid ${c}` : 'none',
                    outline: cover===c && c ? `2px solid ${c}` : 'none',
                    outlineOffset:'2px',
                    transform: cover===c ? 'scale(1.15)' : 'scale(1)', transition:'all .15s',
                  }} />
                ))}
              </div>
            </div>

            {/* Hinzufügen */}
            <div>
              <div style={S.sec}>— Hinzufügen</div>
              <button onClick={addChecklist} style={S.btn}>
                <span>☑</span> Checkliste
              </button>
            </div>

            {/* Karte löschen */}
            <div style={{ marginTop:'auto', paddingTop:'16px', borderTop:'1px solid var(--bd)' }}>
              <button onClick={() => onDelete(card.id)} style={{
                width:'100%', padding:'8px', background:'transparent',
                border:'1px solid rgba(239,68,68,.3)', borderRadius:'5px',
                color:'rgba(239,68,68,.7)', fontFamily:'var(--fm)', fontSize:'11px',
                letterSpacing:'1px', cursor:'pointer', transition:'all .15s',
              }}>
                Karte löschen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
