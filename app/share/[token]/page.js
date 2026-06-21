import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

export default async function SharePage({ params }) {
  const { token } = await params

  const board = await prisma.board.findFirst({
    where: { shareToken: token, isPublic: true },
    include: {
      columns: { orderBy: { order: 'asc' } },
      labels:  { orderBy: { order: 'asc' } },
      cards:   { orderBy: { order: 'asc' } }
    }
  })

  if (!board) notFound()

  return (
    <div style={{ minHeight:'100vh', background:'#0e0e0d', fontFamily:"'Cabinet Grotesk', sans-serif", color:'#edeae3' }}>
      <div style={{ height:'52px', display:'flex', alignItems:'center', padding:'0 20px', background:'rgba(14,14,13,.95)', borderBottom:'1px solid rgba(237,234,227,.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'26px', height:'26px', background:'#5865f2', borderRadius:'5px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Bebas Neue',sans-serif", fontSize:'12px', color:'#fff' }}>SD</div>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'18px', letterSpacing:'3px' }}>BOARD</span>
          <span style={{ color:'rgba(237,234,227,.3)', margin:'0 8px' }}>·</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'12px', color:'#a8a49d' }}>{board.title}</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', color:'#ef4444', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', padding:'2px 8px', borderRadius:'10px' }}>read-only</span>
        </div>
      </div>

      <div style={{ display:'flex', gap:'12px', padding:'16px', overflowX:'auto', alignItems:'flex-start' }}>
        {board.columns.map(col => {
          const cards = board.cards.filter(c => c.columnId === col.id).sort((a,b) => a.order - b.order)
          return (
            <div key={col.id} style={{ flexShrink:0, width:`${col.width || 300}px`, background:'#1c1b18', borderRadius:'8px' }}>
              <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(237,234,227,.06)', display:'flex', gap:'8px', alignItems:'center' }}>
                <span style={{ fontFamily:"'Cabinet Grotesk',sans-serif", fontWeight:700, fontSize:'14px' }}>{col.title}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', color:'rgba(237,234,227,.3)', background:'rgba(237,234,227,.04)', border:'1px solid rgba(237,234,227,.08)', borderRadius:'10px', padding:'1px 7px' }}>{cards.length}</span>
              </div>
              <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:'6px' }}>
                {cards.map(card => (
                  <div key={card.id} style={{ background:'#252420', border:'1px solid rgba(237,234,227,.06)', borderRadius:'7px', padding:'11px 13px' }}>
                    <div style={{ fontWeight:600, fontSize:'13px', marginBottom:'6px' }}>{card.title}</div>
                    {card.priority && (
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', padding:'2px 7px', borderRadius:'3px', background:card.priority==='high'?'rgba(239,68,68,.15)':card.priority==='medium'?'rgba(234,179,8,.15)':'rgba(34,197,94,.15)', color:card.priority==='high'?'#ef4444':card.priority==='medium'?'#eab308':'#22c55e' }}>
                        {card.priority==='high'?'Hoch':card.priority==='medium'?'Mittel':'Niedrig'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
