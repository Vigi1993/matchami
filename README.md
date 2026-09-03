# MatchAmI — app

Frontend Next.js (App Router, TypeScript, Tailwind) + backend Supabase
(Postgres, Auth, RLS). Lo schema del database è in
`supabase/migrations/0001_init.sql`.

## Cosa è già fatto

- [x] Scaffold Next.js con TypeScript + Tailwind, palette colori del
      prototipo già configurata in `src/app/globals.css`
- [x] Client Supabase per browser (`src/lib/supabase/client.ts`),
      server (`src/lib/supabase/server.ts`) e middleware di sessione
      (`src/proxy.ts`)
- [x] Migrazione SQL completa e **testata** (tabelle + RLS) in
      `supabase/migrations/0001_init.sql`
- [x] Build (`npm run build`) e lint (`npx eslint .`) puliti, zero errori
- [x] Repo git locale inizializzato

## Cosa devi fare tu (richiede i tuoi account)

Non ho accesso a GitHub, Supabase o Vercel per conto tuo: questi passaggi
vanno fatti a mano, una tantum.

### 1. Crea il progetto Supabase
1. Vai su [supabase.com](https://supabase.com) → **New project**.
2. Una volta creato, apri **SQL Editor** → incolla il contenuto di
   `supabase/migrations/0001_init.sql` → **Run**.
   (Se preferisci la riga di comando: `npx supabase link` e
   `npx supabase db push`, ma per iniziare l'editor va benissimo.)
3. Vai in **Project Settings → API** e copia `Project URL` e `anon public key`.

### 2. Configura le variabili d'ambiente in locale
```bash
cp .env.local.example .env.local
```
Incolla i due valori copiati al punto 1 dentro `.env.local`.

### 3. Avvia in locale
```bash
npm install
npm run dev
```
Apri `http://localhost:3000`: dovresti vedere la homepage con
"Stato connessione Supabase: ok".

### 4. Crea il repository su GitHub
```bash
# dalla cartella matchami-app
git remote add origin https://github.com/<tuo-utente>/matchami-app.git
git branch -M main
git push -u origin main
```
(Se non hai ancora un repo vuoto su GitHub, creane uno da github.com →
New repository, **senza** README/gitignore, poi esegui i comandi sopra.)

### 5. Deploy su Vercel
1. Vai su [vercel.com](https://vercel.com) → **Add New → Project** →
   importa il repository GitHub appena creato.
2. In **Environment Variables** aggiungi le stesse due variabili di
   `.env.local` (URL e anon key di Supabase).
3. Deploy. Ad ogni push su `main`, Vercel ricostruisce e pubblica in automatico.

## Struttura cartelle

```
matchami-app/
├── src/
│   ├── app/                  → pagine (App Router)
│   ├── lib/supabase/         → client Supabase (browser/server)
│   └── proxy.ts              → rinfresca la sessione ad ogni richiesta
├── supabase/
│   └── migrations/           → schema del database, versionato con il codice
├── .env.local.example        → template variabili d'ambiente (mai committare .env.local)
```

## Prossimi passi (Fase 3+)

- Fase 3: collegare login/registrazione/selezione ruolo a Supabase Auth
  (al posto del login finto del prototipo)
- Fase 4: ricostruire le schermate una per una (Home, Profilo, Candidature,
  Immobili, Database inquilini, Gestione affitti, Chat...)
- Fase 5: funzionalità realtime (chat, notifiche)
