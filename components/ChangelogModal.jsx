'use client'
import { useEffect, useState } from 'react'

const CHANGELOG_VERSION = '2026-06-21-haefx-2'

const CHANGELOG = {
  title: 'Changelog',
  date: '21.06.2026',
  author: 'haefx',
  sections: [
    {
      title: 'Features',
      items: [
        'Coolify-ready Hosting mit Prisma/Postgres Startsync, Healthcheck und Docker Setup.',
        'Discord Login mit boardbezogenen Mitgliedschaften und Rollen.',
        'Mitglieder koennen per Discord Name, Discord User ID oder Email eingeladen werden.',
        'Board-Spalten koennen per Drag & Drop sortiert werden.',
        'Spaltenbreite kann pro Board angepasst und gespeichert werden.',
        'Trello-aehnliche Filter mit Keyword, Mitgliedern, Faelligkeit, Prioritaet, Labels und Spalten.',
        'Aufmerksamkeitsleiste fuer laengst ueberfaellige, ueberfaellige, heutige, High-Prio und eigene Karten.',
        'Eigene Board-Labels mit Farben, Bearbeiten, Loeschen und automatischer Karten-Aktualisierung.',
        'Cards koennen aus JSON oder Textlisten importiert werden.',
        'Card-Import unterstuetzt Custom Labels, Zielspalten, Prioritaeten, Daten, Beschreibungen und Checklisten.',
        'Board-Namen koennen direkt im Board-Header bearbeitet werden.',
        'Card-Import kann fehlende Spalten automatisch aus dem angegebenen Spaltentitel erstellen.',
      ],
    },
    {
      title: 'Bug Fixes',
      items: [
        'Boards und Cards werden persistent ueber Prisma/Postgres gespeichert.',
        'Board-Erstellung leitet wieder korrekt weiter.',
        'Meine Boards bleibt nicht mehr endlos im Ladezustand haengen.',
        'Mitglieder-Formular bricht rechts nicht mehr aus dem Layout.',
        'Einladungen zeigen verstaendliche Fehler statt Produktions-500.',
        'Kartenloeschen hat jetzt eine Bestaetigung gegen versehentliche Klicks.',
        'Card-Modal bleibt offen, wenn Cover, Datum, Labels oder Beschreibung geaendert werden.',
        'Card-Beschreibung und Modal sind groesser ziehbar.',
      ],
    },
    {
      title: 'Verbesserungen',
      items: [
        'Rechtsklickmenue fuer schnelle Kartenbearbeitung mit Prioritaet, Labels, Details und Loeschen.',
        'Share-Ansicht nutzt gespeicherte Spaltenbreiten.',
        'Filter-Reminder aktivieren direkt die passenden Boardfilter.',
        'Neue Labels aus Importen werden automatisch als Board-Labels angelegt.',
        'Importierte Cards werden additiv angelegt, bestehende Cards bleiben unveraendert.',
        'Board-Updates validieren erlaubte Felder serverseitig vor dem Speichern.',
      ],
    },
  ],
}

export default function ChangelogModal({ user }) {
  const [open, setOpen] = useState(false)
  const storageKey = `sdboard:changelog:${user?.id || user?.email || 'local'}`

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) !== CHANGELOG_VERSION) {
        setOpen(true)
      }
    } catch {
      setOpen(true)
    }
  }, [storageKey])

  function close() {
    try {
      window.localStorage.setItem(storageKey, CHANGELOG_VERSION)
    } catch {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      onClick={e => e.target === e.currentTarget && close()}
      style={{
        position:'fixed', inset:0, zIndex:900, background:'rgba(0,0,0,.68)',
        backdropFilter:'blur(8px)', display:'flex', alignItems:'flex-start',
        justifyContent:'center', padding:'80px 16px 24px', overflowY:'auto',
      }}
    >
      <div style={{
        width:'min(720px, 100%)', maxHeight:'calc(100vh - 120px)', overflowY:'auto',
        background:'var(--ink2)', border:'1px solid var(--bd2)', borderRadius:'8px',
        boxShadow:'0 30px 90px rgba(0,0,0,.55)',
      }}>
        <div style={{
          display:'flex', alignItems:'flex-start', justifyContent:'space-between',
          gap:'16px', padding:'20px 22px', borderBottom:'1px solid var(--bd2)',
        }}>
          <div>
            <div style={{ fontFamily:'var(--fd)', fontSize:'28px', letterSpacing:'1px', color:'var(--td)' }}>
              {CHANGELOG.title}
            </div>
            <div style={{ fontFamily:'var(--fm)', fontSize:'11px', color:'var(--faint)', marginTop:'3px' }}>
              {CHANGELOG.date} · {CHANGELOG.author}
            </div>
          </div>
          <button
            onClick={close}
            style={{
              width:'32px', height:'32px', borderRadius:'6px', border:'1px solid var(--bd2)',
              background:'var(--ink3)', color:'var(--dim)', fontFamily:'var(--fm)',
              fontSize:'14px', flexShrink:0,
            }}
          >
            x
          </button>
        </div>

        <div style={{ padding:'18px 22px 22px', display:'flex', flexDirection:'column', gap:'18px' }}>
          {CHANGELOG.sections.map(section => (
            <section key={section.title}>
              <div style={{
                fontFamily:'var(--fm)', fontSize:'11px', color:'#9da5f3',
                letterSpacing:'1px', textTransform:'uppercase', marginBottom:'9px',
              }}>
                {section.title}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                {section.items.map(item => (
                  <div key={item} style={{
                    display:'grid', gridTemplateColumns:'12px 1fr', gap:'9px',
                    color:'var(--dim)', fontSize:'14px', lineHeight:1.45,
                  }}>
                    <span style={{
                      width:'5px', height:'5px', borderRadius:'50%', background:'var(--em)',
                      marginTop:'8px',
                    }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <button
            onClick={close}
            style={{
              alignSelf:'flex-end', marginTop:'4px', padding:'9px 14px',
              borderRadius:'6px', border:'1px solid rgba(88,101,242,.45)',
              background:'rgba(88,101,242,.25)', color:'#fff',
              fontFamily:'var(--fb)', fontSize:'13px', fontWeight:700,
            }}
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  )
}
