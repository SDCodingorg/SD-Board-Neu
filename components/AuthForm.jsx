'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { registerUser } from '@/lib/actions/auth'

export default function AuthForm() {
  const router = useRouter()
  const [mode, setMode]   = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw]       = useState('')
  const [name, setName]   = useState('')
  const [error, setError] = useState('')
  const [load, setLoad]   = useState(false)

  const inp = {
    width: '100%', padding: '11px 13px',
    background: 'var(--ink2)', border: '1px solid var(--bd2)',
    borderRadius: '6px', color: 'var(--td)',
    fontFamily: 'var(--fb)', fontSize: '14px',
    outline: 'none', transition: 'border-color .15s',
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoad(true)
    try {
      if (mode === 'register') {
        await registerUser(email, pw, name)
      }
      const res = await signIn('credentials', {
        email, password: pw, redirect: false,
      })
      if (res?.error) { setError('Email oder Passwort falsch'); setLoad(false); return }
      router.push('/')
    } catch (err) {
      setError(err.message); setLoad(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--ink)', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'400px' }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'36px', justifyContent:'center' }}>
          <div style={{ width:'44px', height:'44px', background:'var(--em)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:'var(--fd)', fontSize:'20px', color:'#fff', letterSpacing:'1px' }}>SD</span>
          </div>
          <span style={{ fontFamily:'var(--fd)', fontSize:'32px', letterSpacing:'4px', color:'var(--td)' }}>BOARD</span>
        </div>

        <div style={{ background:'var(--ink2)', border:'1px solid var(--bd2)', borderRadius:'10px', padding:'32px' }}>
          {/* Tabs */}
          <div style={{ display:'flex', gap:'6px', marginBottom:'24px', background:'var(--ink)', borderRadius:'6px', padding:'4px' }}>
            {['login','register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex:1, padding:'8px', borderRadius:'5px', border:'none', fontSize:'13px', fontWeight:600,
                background: mode===m ? 'var(--em)' : 'transparent',
                color: mode===m ? '#fff' : 'var(--dim)',
                transition:'all .15s',
              }}>
                {m === 'login' ? 'Anmelden' : 'Registrieren'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {mode === 'register' && (
              <input style={inp} placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
            )}
            <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input style={inp} type="password" placeholder="Passwort" value={pw} onChange={e => setPw(e.target.value)} required />

            {error && (
              <div style={{ color:'#ef4444', fontFamily:'var(--fm)', fontSize:'12px', padding:'8px 10px', background:'rgba(239,68,68,.1)', borderRadius:'5px', border:'1px solid rgba(239,68,68,.25)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={load} style={{
              width:'100%', padding:'11px', background:'var(--em)', border:'none',
              borderRadius:'6px', color:'#fff', fontWeight:700, fontSize:'14px',
              opacity: load ? .6 : 1, transition:'all .15s',
            }}>
              {load ? '...' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>

          {/* Social login */}
          <div style={{ marginTop:'16px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--fm)', fontSize:'10px', color:'var(--faint)', marginBottom:'10px' }}>oder</div>
            <button onClick={() => signIn('discord', { callbackUrl:'/' })} style={{
              width:'100%', padding:'10px', background:'var(--em)',
              border:'1px solid rgba(88,101,242,.45)', borderRadius:'6px',
              color:'#fff', fontWeight:700, fontSize:'13px',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
              transition:'all .15s', marginBottom:'8px',
            }}>
              Mit Discord anmelden
            </button>
            <button onClick={() => signIn('google', { callbackUrl:'/' })} style={{
              width:'100%', padding:'10px', background:'var(--ink3)',
              border:'1px solid var(--bd2)', borderRadius:'6px',
              color:'var(--dim)', fontWeight:600, fontSize:'13px',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
              transition:'all .15s',
            }}>
              <span>🔵</span> Mit Google anmelden
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
