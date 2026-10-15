# Northstar Journal - demo-esittely

Tämä 2–3 minuutin käsikirjoitus on tarkoitettu portfolio- tai rekrytointiesittelyyn. Julkisessa demossa kaikki luvut ja chartit ovat synteettistä read-only-dataa.

## 0:00–0:15 — Ongelma

Treidaaja tarvitsee yhden paikan, jossa DAS Traderin executionit muuttuvat luotettaviksi round-trip-treideiksi ja myöhemmin opittaviksi havainnoiksi. Manuaalinen CSV-työ, kulujen täsmäytys ja hajallaan olevat chartit vaikeuttavat palautesilmukkaa.

## 0:15–0:45 — Dashboard

Avaa dashboard. Näytä net P&L, win rate, profit factor, kulut sekä cumulative P&L-, daily P&L- ja drawdown-kaaviot. Mainitse, että tuotannossa sama näkymä laskee käyttäjän omasta Supabase-datasta.

## 0:45–1:10 — Treidi ja chart

Avaa yksi demotreidi. Näytä entry- ja exit-VWAP, fee-rivi, fillit ja paikallinen 1 minuutin kynttilächart. Korosta, että tuotantoversio arkistoi Alpaca-markkinadatan Supabase Storageen, mutta julkinen demo ei tarvitse ulkoisia API-avaimia.

## 1:10–1:35 — Review

Näytä review-muistiinpano, rating ja tagit. Kerro, että oikeassa sovelluksessa muutokset tallennetaan versionoituna ja liitetään treidiin vakaan trade keyn avulla.

## 1:35–1:55 — Analytiikka

Vaihda weekday/hour- ja price/volume-välilehtiin. Näytä, miten treidien määrä ja net P&L voidaan erottaa toisistaan: aktiivisin aika ei välttämättä ole paras aika.

## 1:55–2:20 — Arkkitehtuuri

Näytä yksi arkkitehtuurikuva tai README: DAS Trader auto-export → Windows tray-agentti → HTTPS snapshot API → Supabase RLS → reconstruct/analytics → Next.js. Mainitse idempotentti snapshot-import, fillien deduplikointi ja broker-kulujen täsmäytys.

## 2:20–2:35 — Lopetus

Kerro teknologiat: Next.js/TypeScript, Supabase/PostgreSQL/RLS, .NET 8 WinForms tray-agentti, SQLite-outbox, Vitest, Playwright ja xUnit. Lopeta linkkiin `/demo` ja repositoryn README:hen.
