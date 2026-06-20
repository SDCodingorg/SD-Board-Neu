import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import DiscordProvider from 'next-auth/providers/discord'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/auth', error: '/auth' },
  providers: [
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET ? [
      DiscordProvider({
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        authorization: { params: { scope: 'identify email' } },
      })
    ] : []),
    ...(process.env.GOOGLE_CLIENT_ID ? [
      GoogleProvider({
        clientId:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    ] : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Passwort', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({ where: { email: credentials.email } })
        if (!user?.password) return null
        const ok = await bcrypt.compare(credentials.password, user.password)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        if (!session.user.id && session.user.email) {
          const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } })
          session.user.id = dbUser?.id
        }
      }
      return session
    },
  },
}
