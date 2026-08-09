# Northstar Journal — DAS Live Import

Vaiheen 1 toteutus synkronoi DAS Traderin automaattisesti päivittyvän `Trades.csv`-tiedoston Windows-agentilta Supabaseen ja näyttää fillit, avoimet positiot sekä zero-to-zero-treidit Next.js-sovelluksessa.

## Rakenne

- `apps/web` — Next.js-sovellus, agentti-API:t ja live-treidiloki
- `apps/das-sync-agent` — .NET 8 Windows tray -agentti
- `packages/trade-domain` — DAS-parseri ja weighted-average-cost-positiomoottori
- `supabase/migrations` — PostgreSQL-skeema, RLS ja atominen treidien uudelleenrakennus
- `examples` — hyväksymistestien DAS- ja broker-fixturet

## Paikallinen web-kehitys

Edellytykset: Node.js 24, pnpm 11, Docker ja Supabase CLI.

1. Kopioi `.env.example` tiedostoksi `apps/web/.env.local`.
2. Käynnistä Supabase: `supabase start`.
3. Täytä paikallisen Supabasen URL, anon-avain ja service-role-avain.
4. Asenna riippuvuudet: `pnpm install`.
5. Käynnistä web: `pnpm dev`.

Magic-link-paluuosoite on `/auth/callback`. Tuotannossa lisää sama osoite Supabasen sallittuihin redirect-osoitteisiin.

## Windows-agentti

Kehityskäännös:

```powershell
dotnet build apps/das-sync-agent/TradingJournal.DasSyncAgent.csproj
```

Portable julkaisu:

```powershell
dotnet publish apps/das-sync-agent/TradingJournal.DasSyncAgent.csproj `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -o artifacts/das-sync
```

Käyttöönotto:

1. Kirjaudu web-sovellukseen ja avaa **DAS Sync**.
2. Luo kuusinumeroinen parituskoodi.
3. Käynnistä `TradingJournal.DasSync.exe`, anna journalin HTTPS-osoite ja koodi.
4. Valitse DAS:n auto-export-hakemisto.
5. Ota halutessasi automaattikäynnistys käyttöön tray-valikosta.

Agentin asetukset, DPAPI-suojattu token, SQLite-outbox ja päiväarkisto sijaitsevat `%LOCALAPPDATA%\TradingJournal`-hakemistossa.

## DAS-asetus

DAS Traderissa auto-export löytyy kohdasta `Setup → Other Configurations → Report`. Valitse 60 tai 120 sekunnin väli ja agentille valittu hakemisto. Agentti tukee sekä saman `Trades.csv`:n ylikirjoitusta että uusia `Trades*.csv`-tiedostoja.

## Tuotanto

1. Luo Supabase-projekti ja suorita `supabase db push`.
2. Ota email magic link käyttöön ja aseta tuotannon Site URL.
3. Luo Vercel-projekti `apps/web`-hakemistosta.
4. Lisää kaikki `.env.example`-muuttujat Verceliin.
5. Varmista, että service-role-avain on vain palvelinympäristössä.

## Tarkistukset

- `pnpm test` — domain- ja web-testit
- `pnpm typecheck` — TypeScript
- `pnpm lint` — ESLint
- `pnpm build` — tuotantokäännös
- `dotnet test TradingJournal.sln` — Windows-agentti

Domain-fixture varmistaa 59 filliä, 11 orderia, 5 treidiä ja `-$2.6318` gross P&L:n.
