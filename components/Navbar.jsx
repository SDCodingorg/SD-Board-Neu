'use client'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { useTheme } from '@/context/ThemeContext'
import ChangelogModal from './ChangelogModal'

export default function Navbar({ user }) {
  const { dark, toggle } = useTheme()

  return (
    <>
    <nav style={{
      height:'64px', display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 28px', borderBottom:'1px solid var(--bd2)',
      background:'var(--nav-bg)', backdropFilter:'blur(12px)',
      position:'sticky', top:0, zIndex:100,
    }}>
      <Link href="/" style={{ display:'flex', alignItems:'center', gap:'10px', textDecoration:'none' }}>
        <div style={{ width:'30px', height:'30px', background:'var(--em)', borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:'var(--fd)', fontSize:'14px', color:'#fff', letterSpacing:'1px' }}>SD</span>
        </div>
        <span style={{ fontFamily:'var(--fd)', fontSize:'20px', letterSpacing:'3px', color:'var(--td)' }}>BOARD</span>
      </Link>

      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <button onClick={toggle} style={{
          background:'var(--ink3)', border:'1px solid var(--bd2)',
          borderRadius:'6px', color:'var(--dim)', padding:'6px 14px',
          fontFamily:'var(--fm)', fontSize:'11px', letterSpacing:'1px',
          transition:'all .15s',
        }}>
          {dark ? '☀ DARK' : '🌙 LIGHT'}
        </button>
        <Link href="/create" style={{
          background:'rgba(88,101,242,.15)', border:'1px solid rgba(88,101,242,.4)',
          borderRadius:'6px', color:'#9da5f3', padding:'7px 18px',
          fontFamily:'var(--fb)', fontWeight:700, fontSize:'13px',
          textDecoration:'none', transition:'all .15s',
        }}>
          + Board
        </Link>
        {user?.image
          ? <img src={user.image} alt="" style={{ width:'32px', height:'32px', borderRadius:'50%', border:'2px solid var(--em)' }} />
          : <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'var(--em)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--fd)', fontSize:'14px', color:'#fff' }}>
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
        }
        <button onClick={() => signOut({ callbackUrl: '/auth' })} style={{
          background:'none', border:'1px solid var(--bd2)', borderRadius:'6px',
          color:'var(--faint)', padding:'6px 12px', fontFamily:'var(--fm)', fontSize:'10px',
          letterSpacing:'1px', textTransform:'uppercase', transition:'all .15s',
        }}>
          Logout
        </button>
      </div>
    </nav>
    <ChangelogModal user={user} />
    </>
  )
}
