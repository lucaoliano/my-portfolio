---
target: dashboard
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/my-portfolio/src/app/index.tsx"
target_fingerprint: "sha256:366e40fabf94c595ad2b93810988c562570f4a9126cd772695aa477d3adf6132"
target_path: /home/user/my-portfolio/src/app/index.tsx
timestamp: 2026-10-10T06-12-56Z
slug: src-app-index-tsx
---
# Critique v4 — Panoramica (dopo commit 3532028)
Score 26/40 · P0 0 · P1 3 · P2 2 · P3 1
H: status 3, real-world 3, control 3, consistency 2, prevention 3, recognition 2, flexibility 2, minimal 3, recovery 3, help 2.
Verdict: contenuto specifico (Chiusura <data>, ≈, n/d, coverage, toggle liquidità); forma visiva generica da trading app.
P1 grafico andamento: valore con versamenti, colore dal segno (viola Meaning-Only Color), scala min-max, ultimo punto da snapshot non live, range oltre lo storico non disabilitati.
P1 stato dati vecchi: avviso sotto il grafico, pesi/salute ricalcolati in silenzio, "Eccellente" con esclusioni, motivo "cambio" invece di outage.
P1 contrasto: Riprova nel banner errore onStrong su negative dark 2.82:1 (index.tsx:1197).
P2 righe titolo a 390px: peso orfano, nome core troncato, avatar iniziali inutili.
P2 a11y: tab metrica e riga Dati incompleti 32px; CopyableText tab stop morto; valore gruppo letto due volte; accessibilityState/Hint/Actions e accessibilityElementsHidden ignorati da react-native-web 0.21.
P3 header affollato: due segmented control, due timestamp, "Valore investito" ambiguo, ≈ non spiegato, alert scattati teal vs ambra.
Minori: health 100/excellent con patrimonio 0; latestMarketTime = max tra borse; denominatori misti nella strip salute; gruppo nome 20px > valore 18px.
Detector: 0 findings (non analizza RN).
