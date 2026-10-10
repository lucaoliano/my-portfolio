---
target: zainetto fiscale
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/home/user/my-portfolio/src/app/tax-report.tsx"
target_fingerprint: "sha256:32dc60270483fa988d7d8352f787af2e4a0de0265019b8c2a1438f82a12ee745"
target_path: /home/user/my-portfolio/src/app/tax-report.tsx
timestamp: 2026-10-10T07-22-42Z
slug: src-app-tax-report-tsx
---
# Critique v1 — Zainetto fiscale
Score 16/40 · P0 2 · P1 2 · P2 1
H: status 2, real-world 1, control 3, consistency 2, prevention 1, recognition 3, flexibility 1, minimal 2, recovery 0, help 1.
Verdict: contenuto italiano specifico (bucket per anno, Anno+4), forma da dashboard fintech generica, gergo (MCP, IBRIDO MCP, CALCOLO FIFO, Trade Chiusi).
P0 Calcolo server (calculateTaxReportFromTransactions): loop bucket salta l'anno in scadenza, totale include perdite scadute, nessuna compensazione, costBasis unitario letto come totale (percentuali x10), report server sostituisce quello client e fa sparire i trade manuali; refresh non ricalcola.
P0 Calcolo client: FIFO invece del costo medio ponderato, commissioni e valuta ignorate, ETF riconosciuti dal nome (Netflix -> ETF; "iShares Core MSCI World" -> non ETF), vendita senza acquisto = tutto plusvalenza, bucket scaduti ma usati mostrati come SCADUTA 0%, compensazione per anno invece che per data, broker diversi mescolati.
P1 Zeri finti e colori: "-€0,00" rosso, || 0 ovunque, stato vuoto durante il caricamento, verde per credito/compensato/badge, "€-350" senza formatSignedCurrency, toFixed con punto, quantità float grezze.
P1 Cifra presentata come certa: nessun "stima", data di calcolo, fonte; tab Strategie con tono da consulenza; nessun disclaimer.
P2 Tipografia/a11y: 13 stili sotto 12px (badge 9px), target 36-40px, tab senza stato selezionato, etichette tab su 2 righe.
Detector: 0 findings (non analizza RN). Contrasti testo: tutti AA.
