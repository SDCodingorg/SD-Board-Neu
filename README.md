# SDBoard - Next.js + Prisma + PostgreSQL

Kollaboratives Projektmanagement-Tool.

## Stack
- **Next.js 16** (App Router, Server Components, Server Actions)
- **Prisma ORM** (DB-Abstraktion, Schema-Sync)
- **PostgreSQL** (laeuft via Coolify auf deinem Server)
- **NextAuth v4** (Sessions, OAuth, Credentials)

## Lokale Entwicklung

```bash
# 1. Abhaengigkeiten
npm install

# 2. PostgreSQL starten (Docker)
docker run -d --name sdboard-db \
  -e POSTGRES_DB=sdboard \
  -e POSTGRES_USER=sdboard \
  -e POSTGRES_PASSWORD=sdboard123 \
  -p 5432:5432 postgres:16-alpine

# 3. .env anpassen

# 4. DB Schema + Seed
npx prisma db push
npm run seed

# 5. Dev-Server
npm run dev
```

## Deployment via Coolify

### 1. PostgreSQL in Coolify erstellen
- Coolify -> Resources -> New -> PostgreSQL
- User: `sdboard`, DB: `sdboard`, Passwort waehlen
- Connection-String notieren

### 2. App deployen
- Coolify -> New Service -> Git Repository
- Repository-URL eintragen
- Build-Pack: **Dockerfile**
- Port: **3000**
- Environment Variables setzen:

```env
DATABASE_URL=postgresql://sdboard:PASSWORT@COOLIFY_DB_HOST:5432/sdboard
NEXTAUTH_URL=https://deine-domain.de
NEXTAUTH_SECRET=langer-zufaelliger-string
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
RUN_SEED=false
```

`RUN_SEED=true` legt Demo-Daten an. Fuer echte Produktivdaten besser auf `false` lassen.

Board-Mitglieder koennen nach ihrem ersten Discord-Login per Discord User ID, Discord-Name oder Email eingeladen werden. Wenn ein Name nicht eindeutig ist, die Discord User ID verwenden.

### 3. NEXTAUTH_SECRET generieren

```bash
openssl rand -base64 32
```

### 4. Authorized Redirect URI (Google OAuth, falls genutzt)

In Google Cloud Console:

```text
https://deine-domain.de/api/auth/callback/google
```

Discord Developer Portal:

```text
https://deine-domain.de/api/auth/callback/discord
```

### 5. Optional: Server Actions hinter Proxy

Normalerweise reicht Same-Origin. Falls Coolify oder ein Proxy einen abweichenden Origin sendet:

```env
SERVER_ACTION_ALLOWED_ORIGINS=deine-domain.de
```

### Healthcheck

Der Container stellt `GET /api/health` bereit und prueft dabei auch die Datenbankverbindung.

## Demo-Login

Nur wenn `RUN_SEED=true` gesetzt wurde:
- Email: `demo@sdboard.dev`
- Passwort: `demo1234`
