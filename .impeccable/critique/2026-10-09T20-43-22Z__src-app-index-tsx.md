---
target: dashboard
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/my-portfolio/src/app/index.tsx"
target_fingerprint: "sha256:a20ca4046da446e13edbe0510ce20f4ea275772d4c7ea6f86a11494c829577dc"
target_path: /home/user/my-portfolio/src/app/index.tsx
timestamp: 2026-10-09T20-43-22Z
slug: src-app-index-tsx
---
Method: dual-agent (A: design review · B: detector + evidence)

## Design Health Score — 25/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | "Prezzi delle" è l'ora di scaricamento, non di mercato; dopo un errore manca l'età dei prezzi |
| 2 | Match System / Real World | 3 | "Bilancio totale" esclude la liquidità di default |
| 3 | User Control and Freedom | 3 | Inclusione liquidità solo dalle impostazioni Scalable |
| 4 | Consistency and Standards | 2 | Peso ETF 72% in riga vs 64,1% nella Salute; totale €33.685 vs €37.896 |
| 5 | Error Prevention | 3 | Titolo escluso per cambio annunciato anche come "valutato al costo" |
| 6 | Recognition Rather Than Recall | 2 | Asterisco spiegato solo in fondo; torta non spiegata |
| 7 | Flexibility and Efficiency | 2 | Nessun ordinamento/filtro, gruppi duplicati non nascondibili |
| 8 | Aesthetic and Minimalist Design | 2 | Fino a 7 numeri per riga, troppo verde, stato di errore ripetuto 6 volte |
| 9 | Error Recovery | 3 | Copy chiaro con Riprova, manca l'età dei dati |
| 10 | Help and Documentation | 2 | Nessuna spiegazione di Annuo, punteggio, esclusioni |

## Priority Issues
- [P1] Punteggio Salute "87 Eccellente" con 3 indicatori su 5 non calcolabili; riassunto da fasce di punteggio ("ottima efficienza dei costi" con TER N/D) → harden, clarify
- [P1] Stessa grandezza diversa tra schermate: peso 72% vs 64,1%, totale con/senza liquidità → clarify
- [P1] Stati di dato mancante contraddittori e ripetuti: AAPL sia "valutato al costo" sia "escluso" (aggregator push prima del controllo cambio); "Oggi n/d" ripetuto → distill, harden
- [P2] "Oggi" non distingue chiusura/weekend/mercati aperti; ora di scaricamento invece di marketTime; € sintetizzato senza "≈" → clarify
- [P2] Densità righe, verde ovunque, gruppi duplicati espansi; CopyableText interattivo dentro il pulsante riga (nested-interactive, non button-in-button) → distill, audit

## Detector / evidence
Detector 0 findings. 0 colori hard-coded, 0 trucchi '+20', nessun font <12px statico. Target ok (hitSlop dove serve), eccetto valori CopyableText. Contrasti tutti AA tranne tema chiaro textSecondary su inputBackground (4,32) in scoreScale/kpiLabel della Salute.

## Minor
Riga liquidità troncata; alert raggiunto con bordo verde; posizioni vendute entrano in g.assets; gruppo FX-n/d copia "0" e label VoiceOver dice "€0"; torta 100% "Altro"; pull-to-refresh verde decorativo; layout shift del banner di auto-sync; DESIGN.md cita ancora "Dashboard".
