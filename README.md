# Northstar Journal — DAS Live Import

## Julkinen demo

Portfolioa varten sovelluksessa on kirjautumatta avautuva read-only-demo osoitteessa `/demo`. Demo käyttää erillistä determinististä synteettistä dataa, eikä kutsu Supabasea, Alpaca API:a tai DAS-agenttia. Se näyttää dashboardin, drawdownit, treidien chartit, analytiikan ja review-esimerkit.

Vercelissä demon voi kytkeä pois ympäristömuuttujalla `DEMO_ENABLED=false`. Paikallisesti demo avautuu komennolla `pnpm dev` ja osoitteella `http://localhost:3000/demo`.

Esittelyvideoon ja kuvakaappauksiin liittyvä käsikirjoitus on tiedostossa [`docs/demo/video-script.md`](docs/demo/video-script.md).

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

## Vaihe 2: kulut, dashboard ja chartit

1. Suorita uusin Supabase-migraatio komennolla `supabase db push`.
2. Migraatio luo broker-taulut ja yksityisen `market-data` Storage -bucketin.
3. Lisää Verceliin `ALPACA_API_KEY_ID` ja `ALPACA_API_SECRET_KEY`. Älä käytä niissä `NEXT_PUBLIC_`-etuliitettä.
4. Redeployaa web-sovellus.
5. Lataa brokerin `Transactions.csv` Importit-sivulta.

Chart käyttää Alpaca Basicin historiallista 1 minuutin SIP-dataa. Ensimmäinen täydellisen session avaus tallentaa gzipatun symboli-päivän Supabase Storageen; seuraavat avaukset käyttävät omaa arkistoa.

## Vaihe 3: reviewt, tagit ja drawdown

1. Suorita uusin Supabase-migraatio komennolla `supabase db push`.
2. Migraatio luo `trade_reviews`, `journal_tags` ja `trade_review_tags` -taulut sekä versionoidun `save_trade_review`-RPC:n.
3. Redeployaa web-sovellus.
4. Avaa treidi ja kirjoita muistiinpanot Journal-osiossa. Muutokset tallentuvat automaattisesti noin sekunnin viiveellä.

Review säilyy, vaikka DAS-rekonstruktio poistaisi alkuperäisen treidirivin: tietue jää talteen ja sama `trade_key` liittää sen automaattisesti takaisin. Dashboardin drawdown lasketaan valitun aikavälin päivittäisestä net P&L -käyrästä. Pituudet ovat treidauspäiviä ja rahamäärät dollareita.
