# SDBoard — Next.js + Prisma + PostgreSQL

Kollaboratives Projektmanagement-Tool.

## Stack
- **Next.js 15** (App Router, Server Components, Server Actions)
- **Prisma ORM** (DB-Abstraktion, Migrationen)
- **PostgreSQL** (läuft via Coolify auf deinem Server)
- **NextAuth v4** (Sessions, OAuth, Credentials)

## Lokale Entwicklung

```bash
# 1. Abhängigkeiten
npm install

# 2. PostgreSQL starten (Docker)
docker run -d --name sdboard-db \
  -e POSTGRES_DB=sdboard \
  -e POSTGRES_USER=sdboard \
  -e POSTGRES_PASSWORD=sdboard123 \
  -p 5432:5432 postgres:16-alpine

# 3. .env anpassen (liegt bereits vor)

# 4. DB Schema + Seed
npx prisma db push
npm run seed

# 5. Dev-Server
npm run dev
```

## Deployment via Coolify

### 1. PostgreSQL in Coolify erstellen
- Coolify → Resources → New → PostgreSQL
- User: `sdboard`, DB: `sdboard`, Passwort wählen
- Connection-String notieren

### 2. App deployen
- Coolify → New Service → Git Repository
- Repository-URL eintragen
- Build-Pack: **Dockerfile**
- Environment Variables setzen:

```
DATABASE_URL=postgresql://sdboard:PASSWORT@COOLIFY_DB_HOST:5432/sdboard
NEXTAUTH_URL=https://deine-domain.de
NEXTAUTH_SECRET=langer-zufaelliger-string
GOOGLE_CLIENT_ID=... (optional)
GOOGLE_CLIENT_SECRET=... (optional)
```

### 3. NEXTAUTH_SECRET generieren
```bash
openssl rand -base64 32
```

### 4. Authorized Redirect URI (Google OAuth, falls genutzt)
In Google Cloud Console:
`https://deine-domain.de/api/auth/callback/google`

## Demo-Login
Nach dem ersten Deploy (Seed läuft automatisch):
- Email: `demo@sdboard.dev`
- Passwort: `demo1234`
