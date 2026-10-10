---
target: integrazione Scalable
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 3
target_identity: "file:/home/user/my-portfolio/src/app/integrations/scalable.tsx"
target_fingerprint: "sha256:df45877e836d786b132b167d7f1acdf1539dc665da8df0ebf9ff5cb6178b2ef6"
target_path: /home/user/my-portfolio/src/app/integrations/scalable.tsx
timestamp: 2026-10-10T08-58-55Z
slug: src-app-integrations-scalable-tsx
---
# Critique v1 — Integrazione Scalable
Score 14/40 · P0 3 · P1 3 · P2 1 · P3 1
H: status 1, real-world 1, control 2, consistency 1, prevention 1, recognition 2, flexibility 2, minimal 1, recovery 1, help 2.
Verdict: pila generica di card da pannello SaaS, 8 card di pari peso, teal usato come colore dei pulsanti, gergo (MCP, Bearer, get_cash_balance, Agentic Investing, CLI).
P0 Sicurezza: il server scrive nei log l'intera risposta dei token (functions/src/scalableMcp.ts:3214, access/refresh/id token); Disconnetti non revoca nulla presso Scalable (nessuna chiamata di revoca) e il client dichiara successo anche se il server fallisce; documenti non migrati portano ancora segreti al client.
P0 "Modalità Sola Lettura" finta: nessuna funzione legge readOnly, il token CLI ha accesso pieno; il testo promette "impossibile effettuare ordini".
P0 Errori di collegamento invisibili (statusMessage renderizzato solo nel form manuale), polling che non si ferma (not_found/error/slow_down ignorati, nessuna scadenza, chiamate sovrapposte), modale di successo prima della sync, fallback client "demo" che simula una connessione; window.open dopo await bloccato su iOS.
P1 Dati: PAC sommati senza frequenza (100%+17%), "PAC Attivi" include sospesi; avvisi di prezzo mai valutati (ISIN a Yahoo), segno della distanza ambiguo, DISABLED come "raggiunto", €115.00 col punto; tassi Prime/Prime+ fissi senza data, tetto 100.000€ ignorato, "ritenuta" dubbia, liquidità in verde e zeri finti.
P1 Recupero distruttivo: sessione scaduta -> "Disconnetti", che cancella anche piani, avvisi, liquidità; testo "i dati rimarranno" falso; due Disconnetti, conferma piena rossa (2,82:1).
P1 UI da era token: campo Bearer/URL visibile anche da collegati, salvare una preferenza ritesta e può scollegare, nota sicurezza obsoleta.
P2 Accessibilità: zero etichette/ruoli/hitSlop, switch senza nome, 19 stili sotto 12px, target 20-40px, contrasti FAIL in chiaro (chip piano 4,19, badge PAC 4,19, card "In arrivo" 2,78).
P3 Title Case, maiuscolo, emoji, pulsanti 12px raggio vs pillole, alone teal sul modale, pagina integrazioni con badge "MCP PROTOCOL" e broker "in arrivo" non decisi.
Detector: 0 findings (non analizza RN).
