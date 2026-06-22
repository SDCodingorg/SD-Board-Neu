'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { saveBoardWhiteboard } from '@/lib/actions/boards'

const BOARD_W = 2400
const BOARD_H = 1400
const COLORS = ['#5865f2', '#ef4444', '#eab308', '#22c55e', '#38bdf8', '#a855f7', '#edeae3']
const NOTE_COLORS = ['#facc15', '#fb923c', '#86efac', '#93c5fd', '#c4b5fd', '#f9a8d4']

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pointsToPath(points) {
  if (!points?.length) return ''
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
}

function wrapText(text, maxChars = 24) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 8)
}

function exportSvg(elements, zone) {
  const viewBox = zone
    ? `${Math.max(zone.x - 30, 0)} ${Math.max(zone.y - 30, 0)} ${zone.width + 60} ${zone.height + 60}`
    : `0 0 ${BOARD_W} ${BOARD_H}`

  const body = elements.map(element => {
    if (element.type === 'stroke') {
      return `<path d="${escapeXml(pointsToPath(element.points))}" fill="none" stroke="${escapeXml(element.color)}" stroke-width="${element.width || 4}" stroke-linecap="round" stroke-linejoin="round"/>`
    }
    if (element.type === 'zone') {
      return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="18" fill="rgba(88,101,242,.08)" stroke="${escapeXml(element.color || '#5865f2')}" stroke-width="4" stroke-dasharray="18 12"/><text x="${element.x + 22}" y="${element.y + 42}" fill="${escapeXml(element.color || '#5865f2')}" font-family="Arial" font-size="30" font-weight="700">${escapeXml(element.title)}</text>`
    }
    if (element.type === 'note') {
      const lines = wrapText(element.text, 22)
      return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="14" fill="${escapeXml(element.color || '#facc15')}" stroke="rgba(0,0,0,.18)" stroke-width="2"/>${lines.map((line, i) => `<text x="${element.x + 18}" y="${element.y + 36 + i * 25}" fill="#171717" font-family="Arial" font-size="22" font-weight="700">${escapeXml(line)}</text>`).join('')}`
    }
    if (element.type === 'text') {
      return `<text x="${element.x}" y="${element.y}" fill="${escapeXml(element.color || '#edeae3')}" font-family="Arial" font-size="${element.size || 30}" font-weight="700">${escapeXml(element.text)}</text>`
    }
    return ''
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="820" viewBox="${viewBox}"><rect width="100%" height="100%" fill="#10100f"/><g opacity=".16">${Array.from({ length: 49 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${BOARD_H}" stroke="#edeae3" stroke-width="1"/>`).join('')}${Array.from({ length: 29 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="${BOARD_W}" y2="${i * 50}" stroke="#edeae3" stroke-width="1"/>`).join('')}</g>${body}</svg>`
}

export default function WhiteboardView({ boardId, initialData, canWrite, toast }) {
  const svgRef = useRef(null)
  const saveTimer = useRef(null)
  const didMount = useRef(false)
  const [elements, setElements] = useState(() => Array.isArray(initialData?.elements) ? initialData.elements : [])
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState('#5865f2')
  const [noteColor, setNoteColor] = useState('#facc15')
  const [selectedId, setSelectedId] = useState(null)
  const [draftStroke, setDraftStroke] = useState(null)
  const [draftZone, setDraftZone] = useState(null)
  const [drag, setDrag] = useState(null)
  const [saveState, setSaveState] = useState('Gespeichert')

  const selected = useMemo(() => elements.find(element => element.id === selectedId), [elements, selectedId])

  useEffect(() => {
    if (!canWrite) return
    if (!didMount.current) {
      didMount.current = true
      return
    }
    setSaveState('Speichert...')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveBoardWhiteboard(boardId, { version: 1, elements })
        setSaveState('Gespeichert')
      } catch (error) {
        setSaveState('Fehler beim Speichern')
        toast?.(error.message || 'Whiteboard konnte nicht gespeichert werden')
      }
    }, 900)
    return () => clearTimeout(saveTimer.current)
  }, [elements, boardId, canWrite, toast])

  function pointerToBoard(event) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(BOARD_W, ((event.clientX - rect.left) / rect.width) * BOARD_W)),
      y: Math.max(0, Math.min(BOARD_H, ((event.clientY - rect.top) / rect.height) * BOARD_H)),
    }
  }

  function addNote(point) {
    const text = prompt('Text fuer Sticky Note:')
    if (!text?.trim()) return
    setElements(current => [...current, {
      id: uid('note'),
      type: 'note',
      x: point.x,
      y: point.y,
      width: 260,
      height: 150,
      text: text.trim().slice(0, 300),
      color: noteColor,
    }])
  }

  function addText(point) {
    const text = prompt('Text:')
    if (!text?.trim()) return
    setElements(current => [...current, {
      id: uid('text'),
      type: 'text',
      x: point.x,
      y: point.y,
      text: text.trim().slice(0, 220),
      color,
      size: 34,
    }])
  }

  function startDrag(event, element) {
    event.stopPropagation()
    if (!canWrite) {
      setSelectedId(element.id)
      return
    }
    const point = pointerToBoard(event)
    setSelectedId(element.id)
    setDrag({ id: element.id, start: point, original: element })
  }

  function handlePointerDown(event) {
    if (!canWrite) return
    const point = pointerToBoard(event)
    if (tool === 'pen') {
      setDraftStroke({ id: uid('stroke'), type: 'stroke', color, width: 5, points: [point] })
      return
    }
    if (tool === 'note') {
      addNote(point)
      return
    }
    if (tool === 'text') {
      addText(point)
      return
    }
    if (tool === 'zone') {
      setDraftZone({ x: point.x, y: point.y, startX: point.x, startY: point.y })
      return
    }
    setSelectedId(null)
  }

  function handlePointerMove(event) {
    const point = pointerToBoard(event)
    if (draftStroke) {
      setDraftStroke(current => ({ ...current, points: [...current.points, point] }))
      return
    }
    if (draftZone) {
      setDraftZone(current => ({
        ...current,
        x: Math.min(current.startX, point.x),
        y: Math.min(current.startY, point.y),
        width: Math.abs(point.x - current.startX),
        height: Math.abs(point.y - current.startY),
      }))
      return
    }
    if (drag) {
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      setElements(current => current.map(element => {
        if (element.id !== drag.id) return element
        if (element.type === 'stroke') return { ...element, points: drag.original.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
        return { ...element, x: drag.original.x + dx, y: drag.original.y + dy }
      }))
    }
  }

  function handlePointerUp() {
    if (draftStroke) {
      if (draftStroke.points.length > 1) setElements(current => [...current, draftStroke])
      setDraftStroke(null)
    }
    if (draftZone) {
      if ((draftZone.width || 0) > 80 && (draftZone.height || 0) > 80) {
        const title = prompt('Name der Zone:', 'Brainstorming')
        setElements(current => [...current, {
          id: uid('zone'),
          type: 'zone',
          x: draftZone.x,
          y: draftZone.y,
          width: draftZone.width,
          height: draftZone.height,
          title: title?.trim() || 'Zone',
          color,
        }])
      }
      setDraftZone(null)
    }
    setDrag(null)
  }

  function deleteSelected() {
    if (!selected || !canWrite) return
    if (!confirm('Element wirklich loeschen?')) return
    setElements(current => current.filter(element => element.id !== selected.id))
    setSelectedId(null)
  }

  function renameSelected() {
    if (!selected || !canWrite || !['note', 'text', 'zone'].includes(selected.type)) return
    const next = prompt('Neuer Text:', selected.text || selected.title || '')
    if (!next?.trim()) return
    setElements(current => current.map(element => {
      if (element.id !== selected.id) return element
      if (element.type === 'zone') return { ...element, title: next.trim().slice(0, 120) }
      return { ...element, text: next.trim().slice(0, 300) }
    }))
  }

  function exportPdf(zoneOnly = false) {
    const zone = zoneOnly && selected?.type === 'zone' ? selected : null
    const svg = exportSvg(elements, zone)
    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) return toast?.('Popup wurde blockiert')
    win.document.write(`<!doctype html><html><head><title>Whiteboard Export</title><style>@page{size:landscape;margin:10mm}body{margin:0;background:#fff}svg{width:100%;height:auto}button{position:fixed;right:16px;top:16px;padding:10px 14px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">PDF speichern</button>${svg}<script>setTimeout(() => window.print(), 400)</script></body></html>`)
    win.document.close()
  }

  const allElements = draftStroke ? [...elements, draftStroke] : elements

  return (
    <div style={{ flex:1, display:'grid', gridTemplateRows:'auto 1fr', background:'var(--ink)' }}>
      <div style={{
        display:'flex', alignItems:'center', gap:'8px', padding:'10px 16px',
        borderBottom:'1px solid var(--bd2)', background:'var(--ink2)', flexWrap:'wrap',
      }}>
        {[
          ['select', 'Auswahl'],
          ['pen', 'Stift'],
          ['note', 'Sticky'],
          ['text', 'Text'],
          ['zone', 'Zone'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTool(id)} disabled={!canWrite && id !== 'select'} style={toolbarBtn(tool === id)}>
            {label}
          </button>
        ))}
        <div style={{ width:'1px', height:'22px', background:'var(--bd2)', margin:'0 4px' }} />
        {COLORS.map(item => (
          <button key={item} onClick={() => setColor(item)} title={item} style={swatchStyle(item, color === item)} />
        ))}
        <div style={{ width:'1px', height:'22px', background:'var(--bd2)', margin:'0 4px' }} />
        {NOTE_COLORS.map(item => (
          <button key={item} onClick={() => setNoteColor(item)} title={item} style={swatchStyle(item, noteColor === item)} />
        ))}
        <div style={{ flex:1 }} />
        <span style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)' }}>{canWrite ? saveState : 'Nur Lesen'}</span>
        {selected && canWrite && <button onClick={renameSelected} style={toolbarBtn(false)}>Umbenennen</button>}
        {selected && canWrite && <button onClick={deleteSelected} style={{ ...toolbarBtn(false), color:'#f87171', borderColor:'rgba(248,113,113,.35)' }}>Loeschen</button>}
        <button onClick={() => exportPdf(false)} style={toolbarBtn(false)}>PDF alles</button>
        <button onClick={() => exportPdf(true)} disabled={selected?.type !== 'zone'} style={toolbarBtn(false)}>PDF Zone</button>
      </div>

      <div style={{ overflow:'auto', padding:'18px' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width:'1800px', maxWidth:'none', height:'1050px', display:'block',
            background:'#10100f', border:'1px solid var(--bd2)', borderRadius:'8px',
            cursor: canWrite ? (tool === 'select' ? 'default' : 'crosshair') : 'default',
            touchAction:'none',
          }}
        >
          <defs>
            <pattern id="whiteboard-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(237,234,227,.11)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={BOARD_W} height={BOARD_H} fill="url(#whiteboard-grid)" />
          {draftZone && <rect x={draftZone.x} y={draftZone.y} width={draftZone.width || 0} height={draftZone.height || 0} rx="18" fill="rgba(88,101,242,.08)" stroke={color} strokeWidth="4" strokeDasharray="18 12" />}
          {allElements.map(element => (
            <WhiteboardElement
              key={element.id}
              element={element}
              selected={element.id === selectedId}
              onPointerDown={startDrag}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

function WhiteboardElement({ element, selected, onPointerDown }) {
  const outline = selected ? '#ffffff' : 'transparent'
  if (element.type === 'stroke') {
    return (
      <path
        d={pointsToPath(element.points)}
        fill="none"
        stroke={element.color}
        strokeWidth={element.width || 5}
        strokeLinecap="round"
        strokeLinejoin="round"
        onPointerDown={event => onPointerDown(event, element)}
        style={{ cursor:'grab' }}
      />
    )
  }
  if (element.type === 'zone') {
    return (
      <g onPointerDown={event => onPointerDown(event, element)} style={{ cursor:'grab' }}>
        <rect x={element.x} y={element.y} width={element.width} height={element.height} rx="18" fill="rgba(88,101,242,.08)" stroke={element.color || '#5865f2'} strokeWidth="4" strokeDasharray="18 12" />
        <rect x={element.x - 6} y={element.y - 6} width={element.width + 12} height={element.height + 12} rx="22" fill="none" stroke={outline} strokeWidth="3" />
        <text x={element.x + 22} y={element.y + 42} fill={element.color || '#5865f2'} fontFamily="var(--fb)" fontSize="30" fontWeight="800">{element.title}</text>
      </g>
    )
  }
  if (element.type === 'note') {
    return (
      <g onPointerDown={event => onPointerDown(event, element)} style={{ cursor:'grab' }}>
        <rect x={element.x} y={element.y} width={element.width} height={element.height} rx="14" fill={element.color || '#facc15'} stroke={selected ? '#fff' : 'rgba(0,0,0,.18)'} strokeWidth={selected ? 4 : 2} />
        {wrapText(element.text).map((line, index) => (
          <text key={index} x={element.x + 18} y={element.y + 36 + index * 25} fill="#171717" fontFamily="var(--fb)" fontSize="22" fontWeight="800">{line}</text>
        ))}
      </g>
    )
  }
  if (element.type === 'text') {
    return (
      <g onPointerDown={event => onPointerDown(event, element)} style={{ cursor:'grab' }}>
        <text x={element.x} y={element.y} fill={element.color || '#edeae3'} fontFamily="var(--fb)" fontSize={element.size || 34} fontWeight="800">{element.text}</text>
        {selected && <rect x={element.x - 8} y={element.y - 38} width={Math.max(80, String(element.text || '').length * 18)} height="50" fill="none" stroke="#fff" strokeWidth="3" />}
      </g>
    )
  }
  return null
}

function toolbarBtn(active) {
  return {
    fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px', textTransform:'uppercase',
    padding:'7px 11px', borderRadius:'5px', cursor:'pointer',
    background: active ? 'rgba(88,101,242,.22)' : 'transparent',
    color: active ? '#c7cbff' : 'var(--dim)',
    border: active ? '1px solid rgba(88,101,242,.5)' : '1px solid var(--bd2)',
  }
}

function swatchStyle(color, active) {
  return {
    width:'22px', height:'22px', borderRadius:'50%', background:color,
    border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,.28)',
    cursor:'pointer',
  }
}
