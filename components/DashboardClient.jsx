'use client'
import { useRouter } from 'next/navigation'

const COVERS = ['#5865f2','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#059669','#0f172a','#374151']

export default function DashboardClient({ boards, user }) {
  const router = useRouter()

  return (
    <div style={{ paddingTop:'64px', minHeight:'100vh', background:'var(--body-bg)' }}>
      {/* Header */}
      <div style={{ borderBottom:'1px solid var(--bd)', padding:'44px 32px 32px', maxWidth:'1400px', margin:'0 auto' }}>
        <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px' }}>
          // Hallo, {user?.name || user?.email}
        </div>
        <h1 style={{ fontFamily:'var(--fd)', fontSize:'clamp(42px,5vw,64px)', letterSpacing:'2px', color:'var(--td)', marginBottom:'8px' }}>
          MEINE BOARDS.
        </h1>
        <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)', letterSpacing:'1px' }}>
          {boards.length} {boards.length === 1 ? 'Board' : 'Boards'}
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth:'1400px', margin:'0 auto', padding:'44px 32px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:'16px' }}>
          {boards.map(board => (
            <div key={board.id} onClick={() => router.push(`/board/${board.id}`)}
              style={{
                background: board.background
                  ? `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.6)), url(${board.background}) center/cover`
                  : `linear-gradient(135deg, ${board.coverColor}22, var(--ink2))`,
                border:'1px solid var(--bd2)', borderRadius:'10px', padding:'28px 24px',
                minHeight:'200px', cursor:'pointer', display:'flex', flexDirection:'column',
                justifyContent:'flex-end', transition:'transform .15s, box-shadow .15s',
                position:'relative', overflow:'hidden',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 12px 40px rgba(0,0,0,.4)' }}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}
            >
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:board.coverColor }} />
              <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color: board.background ? 'rgba(237,234,227,.7)' : 'var(--dim)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'9px' }}>
                {board.totalCards} Aufgaben
              </div>
              <div style={{ fontFamily:'var(--fd)', fontSize:'28px', letterSpacing:'.5px', color: board.background ? '#fff' : 'var(--td)', marginBottom:'16px', lineHeight:1 }}>
                {board.title}
              </div>
              <div style={{ display:'flex', gap:'16px', flexWrap:'wrap' }}>
                {board.columns.slice(0,4).map(col => (
                  <div key={col.id}>
                    <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color: board.background ? 'rgba(237,234,227,.5)' : 'var(--faint)', marginBottom:'3px', textTransform:'uppercase', letterSpacing:'.5px' }}>
                      {col.title}
                    </div>
                    <div style={{ fontFamily:'var(--fd)', fontSize:'20px', color: board.background ? 'rgba(237,234,227,.85)' : 'var(--dim)' }}>
                      {col.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* New Board */}
          <div onClick={() => router.push('/create')}
            style={{
              background:'var(--ink2)', border:'2px dashed var(--bd2)', borderRadius:'10px',
              padding:'28px 24px', minHeight:'200px', cursor:'pointer',
              display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:'10px',
              transition:'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--em)'; e.currentTarget.style.background='var(--em-bg)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--bd2)'; e.currentTarget.style.background='var(--ink2)' }}
          >
            <div style={{ fontFamily:'var(--fm)', fontSize:'9px', color:'var(--faint)', letterSpacing:'2px', textTransform:'uppercase' }}>// Neu</div>
            <div style={{ fontFamily:'var(--fd)', fontSize:'26px', letterSpacing:'2px', color:'var(--faint)' }}>+ BOARD</div>
          </div>
        </div>
      </div>
    </div>
  )
}
