# Strava-tilkobling (Cloudflare Worker)

Liten server som gjør det trygt å koble Treningslogg-appen til Strava. Den
holder på Strava-hemmelighetene dine (client secret + refresh token) slik at
de aldri havner i den offentlige nettsiden.

## Oppsett (gjøres én gang)

1. Logg inn i Cloudflare (oppretter gratis konto om du ikke har en):

   ```bash
   npx wrangler login
   ```

2. Opprett en KV-database for lagring av Strava-tilkoblingen:

   ```bash
   npx wrangler kv namespace create STRAVA_KV
   ```

   Kommandoen skriver ut en `id = "..."`. Lim den inn i `wrangler.toml` under
   `[[kv_namespaces]]`, i stedet for `REPLACE_WITH_KV_ID`.

3. Deploy en første gang for å få URL-en din:

   ```bash
   npx wrangler deploy
   ```

   Du får en URL som `https://treningsapp-strava.DITT-SUBDOMENE.workers.dev`.
   Noter domenet (uten `https://` og uten sti), du trenger det i steg 4.

4. Opprett en Strava API-app på <https://www.strava.com/settings/api>:
   - **Application Name**: Treningslogg (eller det du vil)
   - **Category**: Training
   - **Website**: `https://kricliff.github.io/treningsapp/`
   - **Authorization Callback Domain**: domenet fra steg 3, f.eks.
     `treningsapp-strava.ditt-subdomene.workers.dev`

   Du får en **Client ID** og en **Client Secret**.

5. Lim Client ID inn i `wrangler.toml` (`STRAVA_CLIENT_ID = "..."`,
   erstatt `REPLACE_WITH_CLIENT_ID`).

6. Sett hemmelighetene (kommandoene spør deg om verdien, lim inn når du
   blir bedt om det — ikke del disse i chat):

   ```bash
   npx wrangler secret put STRAVA_CLIENT_SECRET
   npx wrangler secret put APP_TOKEN
   ```

   `APP_TOKEN` er en enkel delt hemmelighet mellom appen og denne
   workeren, kun for å hindre at tilfeldige boter finner URL-en og spammer
   aktiviteter til Strava-kontoen din. Den ligger synlig i appens
   frontend-kode (det er ikke ekte hemmelighold), men gir en enkel sperre
   mot støy. Den ekte sikkerheten er at Strava-kontoen din kun kan nås via
   Client Secret-en, som aldri forlater denne workeren.

7. Deploy på nytt slik at variablene og hemmelighetene er aktive:

   ```bash
   npx wrangler deploy
   ```

8. Gi Client ID (ikke secret) og worker-URL-en til Claude, så limes de inn
   i `www/index.html` sin frontend-kode.

9. Åpne appen, gå til Innstillinger → «Koble til Strava», og godkjenn
   tilgangen på Strava sin side. Da lagres refresh-token i KV-databasen,
   og du kan bruke «Send til Strava»-knappen på lagrede økter.

## Endepunkter

- `GET /callback` – mottar OAuth-koden fra Strava, bytter den mot tokens
- `POST /send-activity` – oppretter en manuell "Weight Training"-aktivitet
  på Strava, med økt-sammendraget som beskrivelse
- `GET /status` – returnerer om appen er koblet til Strava
