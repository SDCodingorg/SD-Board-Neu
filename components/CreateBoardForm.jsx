'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBoard } from '@/lib/actions/boards'

const BACKGROUNDS = [
  { label:'Keins', url:'' },
  { label:'Stadt', url:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80' },
  { label:'Wald',  url:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&q=80' },
  { label:'Ozean', url:'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=80' },
  { label:'Berge', url:'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80' },
  { label:'Weltall',url:'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1200&q=80' },
  { label:'Aurora', url:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&q=80' },
  { label:'Dark City',url:'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?w=1200&q=80' },
]
const COLORS = ['#5865f2','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#059669','#0f172a','#374151']

const inp = {
  width:'100%', padding:'11px 13px', background:'var(--ink2)',
  border:'1px solid var(--bd2)', borderRadius:'6px', color:'var(--td)',
  fontFamily:'var(--fb)', fontSize:'14px', outline:'none',
}

export default function CreateBoardForm() {
  const router = useRouter()
  const [title,  setTitle]  = useState('')
  const [desc,   setDesc]   = useState('')
  const [dl,     setDl]     = useState('')
  const [color,  setColor]  = useState('#5865f2')
  const [bg,     setBg]     = useState('')
  const [custom, setCustom] = useState('')
  const [error,  setError]  = useState('')
  const [load,   setLoad]   = useState(false)

  const activeBg = custom || bg

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Board-Name ist erforderlich'); return }
    setLoad(true)
    try {
      const id = await createBoard({ title, description:desc, deadline:dl, coverColor:color, background:activeBg })
      router.push(`/board/${id}`)
    } catch (err) {
      setError(err.message); setLoad(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', padding:'80px 20px 40px', background:'var(--body-bg)' }}>
      <div style={{ maxWidth:'600px', margin:'0 auto' }}>
        <h1 style={{ fontFamily:'var(--fd)', fontSize:'52px', letterSpacing:'2px', color:'var(--td)', marginBottom:'32px' }}>
          BOARD<br />ERSTELLEN.
        </h1>
        <form onSubmit={handleSubmit} style={{ background:'var(--ink2)', border:'1px solid var(--bd2)', borderRadius:'12px', padding:'32px', display:'flex', flexDirection:'column', gap:'20px' }}>
          <div>
            <label style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', display:'block', marginBottom:'7px' }}>Board-Name *</label>
            <input style={inp} placeholder="Mein Projekt" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', display:'block', marginBottom:'7px' }}>Beschreibung</label>
            <textarea style={{ ...inp, minHeight:'80px', resize:'vertical' }} value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', display:'block', marginBottom:'7px' }}>Deadline</label>
            <input style={inp} type="date" value={dl} onChange={e => setDl(e.target.value)} />
          </div>
          <div>
            <label style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', display:'block', marginBottom:'10px' }}>Cover-Farbe</label>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{
                  width:'28px', height:'28px', borderRadius:'50%', background:c, border:'none',
                  outline: color===c ? `3px solid ${c}` : 'none', outlineOffset:'2px',
                  transform: color===c ? 'scale(1.2)' : 'scale(1)', transition:'all .15s',
                }} />
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', display:'block', marginBottom:'10px' }}>Hintergrundbild</label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'10px' }}>
              {BACKGROUNDS.map(b => (
                <button key={b.label} type="button" onClick={() => { setBg(b.url); setCustom('') }} style={{
                  height:'60px', borderRadius:'6px', border: bg===b.url&&!custom ? `2px solid ${color}` : '1px solid var(--bd2)',
                  background: b.url ? `url(${b.url}) center/cover` : 'var(--ink3)',
                  cursor:'pointer', display:'flex', alignItems:'flex-end',
                }}>
                  <span style={{ fontFamily:'var(--fm)', fontSize:'9px', color:'#fff', background:'rgba(0,0,0,.5)', padding:'2px 6px', borderRadius:'3px', margin:'4px', letterSpacing:'.5px' }}>{b.label}</span>
                </button>
              ))}
            </div>
            <input style={{ ...inp, fontSize:'12px' }} placeholder="https://eigenes-bild.jpg" value={custom} onChange={e => setCustom(e.target.value)} />
          </div>

          {/* Preview */}
          <div>
            <label style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', display:'block', marginBottom:'7px' }}>Vorschau</label>
            <div style={{
              height:'80px', borderRadius:'8px',
              background: activeBg
                ? `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.6)), url(${activeBg}) center/cover`
                : `linear-gradient(135deg, ${color}22, var(--ink3))`,
              border:'1px solid var(--bd2)', display:'flex', alignItems:'center', padding:'16px',
              borderTop: `3px solid ${color}`,
            }}>
              <span style={{ fontFamily:'var(--fd)', fontSize:'22px', color: activeBg ? '#fff' : 'var(--td)', letterSpacing:'1px' }}>
                {title || 'Board-Name'}
              </span>
            </div>
          </div>

          {error && <div style={{ color:'#ef4444', fontFamily:'var(--fm)', fontSize:'12px', padding:'8px 10px', background:'rgba(239,68,68,.1)', borderRadius:'5px', border:'1px solid rgba(239,68,68,.25)' }}>{error}</div>}

          <button type="submit" disabled={load} style={{
            width:'100%', padding:'13px', background: load ? 'var(--ink4)' : 'var(--em)',
            border:'none', borderRadius:'8px', color:'#fff', fontFamily:'var(--fb)', fontWeight:700, fontSize:'15px',
            opacity: load ? .7 : 1, transition:'all .15s',
          }}>
            {load ? 'Wird erstellt...' : 'Board erstellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
