---
target: dashboard
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/my-portfolio/src/app/index.tsx"
target_fingerprint: "sha256:fea93b5e9dfe568b3d35f4267e241f1024c48c348fdf344690f6bbc14dc5bed0"
target_path: /home/user/my-portfolio/src/app/index.tsx
timestamp: 2026-10-09T20-19-08Z
slug: src-app-index-tsx
---
Method: dual-agent (A: design review · B: detector + evidence)

## Design Health Score — 25/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Nessun orario dei prezzi quando lo scaricamento fallisce |
| 2 | Match System / Real World | 3 | Chip "Scalable" è un nome ma avvia una sync |
| 3 | User Control and Freedom | 3 | Copia solo con pressione lunga |
| 4 | Consistency and Standards | 2 | $ mostrato come € nei gruppi; totale con/senza liquidità diverso tra schermate |
| 5 | Error Prevention | 2 | USD+EUR sommati senza cambio; tasso 2,6% inventato nel health check |
| 6 | Recognition Rather Than Recall | 3 | 6 destinazioni dietro hamburger |
| 7 | Flexibility and Efficiency | 2 | Solo ordine alfabetico, nessun peso % |
| 8 | Aesthetic and Minimalist Design | 2 | 6-8 livelli prima del primo gruppo; righe titolo da 5 righe |
| 9 | Error Recovery | 3 | Errori leggibili con Riprova |
| 10 | Help and Documentation | 2 | Asterischi di gruppo/riga senza nota quando il globale non è stimato |

## Priority Issues
- [P0] Valute miste sommate come euro (portfolioAggregator.ts:189,200,276) → harden
- [P1] Totale diverso tra dashboard (senza liquidità) e salute (con liquidità); tasso 2,6% inventato (usePortfolioOverview.ts) → harden, clarify
- [P1] "Oggi" sparisce senza spiegazione, nessun orario prezzi dopo errore, "+12,36%" compatto senza etichetta → clarify
- [P1] Gerarchia del hero invertita: chip Totale 11px più debole della riga Annuo 13px; card liquidità ~300px; tre controlli di sync → typeset, distill, layout
- [P2] Righe titolo alte (5 righe) e gruppi sovrapposti duplicati → distill, layout

## Detector / evidence
Detector: 0 findings (analizza solo in parte RN). 0 colori hard-coded, 0 trucchi '+20'. Font < 12px: MetricChip sm 11px. Target 40x40 senza hitSlop: torta, chiudi banner. Contrasto: rosso su tinta (scuro) 4,27 FAIL; ambra su tinta (chiaro) 4,25 FAIL; positivo chiaro 4,59 al limite. Nessun pulsante annidato (verificato anche nel browser; il "button in button" in AssetCard segnalato da A è un falso positivo: CopyableText non ha ruolo button).

## Minor
Grammatica "1 titolo senza prezzo, valutati"; alert raggiunto sempre verde; health check: concentrazione su ETF globale segnata rossa, "categoria Altro" esposta come insight, suggerimenti che suonano come consulenza; titolo "Dashboard" in inglese; "e altri" senza numero; locale orari dal dispositivo; minHeight 101%.
