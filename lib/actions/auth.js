'use server'
import bcrypt from 'bcryptjs'
import { prisma } from '../prisma'

export async function registerUser(email, password, name) {
  if (!email || !password || !name) throw new Error('Alle Felder sind erforderlich')
  
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) throw new Error('Email bereits vergeben')

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, password: hashed, name }
  })
  return { id: user.id, email: user.email, name: user.name }
}
