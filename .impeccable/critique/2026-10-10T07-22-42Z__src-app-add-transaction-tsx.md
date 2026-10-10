---
target: inserimento transazione
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/my-portfolio/src/app/add-transaction.tsx"
target_fingerprint: "sha256:ef1044b3fba4686337f86daf1ab355da013468ae43d9a09d594f14cd7aeed203"
target_path: /home/user/my-portfolio/src/app/add-transaction.tsx
timestamp: 2026-10-10T07-22-42Z
slug: src-app-add-transaction-tsx
---
# Critique v1 — Inserimento/modifica transazione
Score 18/40 · P0 1 · P1 3 · P2 1 · P3 1
H: status 2, real-world 2, control 2, consistency 2, prevention 1, recognition 3, flexibility 1, minimal 3, recovery 1, help 1.
Verdict: form generico da tracker; mancano valuta, commissioni, origine Scalable.
P0 Modifica arrotonda quantità e prezzo a 2 decimali (formatInputNumber, edit:90,92): 0,4567 quote -> 0,46 al salvataggio; 0,0049 -> 0.
P1 Prezzo storico: errore silenzioso (getHistoricalPrice ritorna null), prezzo vecchio resta al cambio data, risposta tardiva sovrascrive prezzo digitato.
P1 Niente valuta (add non salva currency) né commissioni; vendita oltre il posseduto e date future accettate; data di default in UTC.
P1 Errori in window.alert bloccanti uno alla volta; gruppi in modifica non si aggiornano dopo change-group; Scalable tx modificabili senza avviso.
P2 Accessibilità: nessuna etichetta/stato (X, copia, segmento, chip), X 32px, copia 22px, bottone "Aggiungi" tagliato fuori schermo sul web (input senza minWidth:0).
P3 Placeholder "150.50" vs "150,50"; parseLocalNumber("1.234")=1,234; "Copiato" in alert; verde usato per selezione e CTA secondaria.
Detector: 0 findings (non analizza RN).
