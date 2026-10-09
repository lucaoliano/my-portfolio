---
target: dashboard
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/my-portfolio/src/app/index.tsx"
target_fingerprint: "sha256:de9f17e451cf118cd1a37fe112393b590bdd6b54c23a587fe2b864ddfdef0d87"
target_path: /home/user/my-portfolio/src/app/index.tsx
timestamp: 2026-10-09T19-34-09Z
slug: src-app-index-tsx
---
Method: dual-agent (A: design review · B: detector + evidence)

## Design Health Score — 24/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Errore quotazioni solo in console (index.tsx:262); nessun "prezzi aggiornati alle…" |
| 2 | Match System / Real World | 3 | Abbreviazioni e inglese: "Tot:", "Ann:", "PM", "Health Check", "Price Alert"; "Bilancio Totale" esclude la liquidità di default |
| 3 | User Control and Freedom | 3 | Gruppi comprimibili e persistenti, banner chiudibili |
| 4 | Consistency and Standards | 2 | Teal usato fuori da Scalable nell'Health Check; gruppi e header impilano 3 chip, le righe uno solo |
| 5 | Error Prevention | 2 | Quotazione mancante = prezzo medio: P/L finto +0,00% verde |
| 6 | Recognition Rather Than Recall | 3 | Copia con pressione lunga e icona torta non scopribili |
| 7 | Flexibility and Efficiency | 2 | Niente ordinamento, peso %, nascondi importi; sync triplicato |
| 8 | Aesthetic and Minimalist Design | 2 | Header fisso ~40-55% dello schermo, Health Check prima dei titoli |
| 9 | Error Recovery | 3 | Sync: Riprova + Ricollega; ma messaggi tecnici grezzi e nessun recupero per le quotazioni |
| 10 | Help and Documentation | 2 | Nota XIRR ottima; nulla spiega punteggio salute o "Oggi" assente |

## Design Specificity Verdict
Dati specifici, involucro intercambiabile. Onestà sui dati (asterisco XIRR, niente zero finto) e lessico italiano sono veri tratti di prodotto; la composizione (numero grande, pillole P/L, pila di card, lista posizioni) è quella di ogni neobroker e ricalca l'app Scalable anche nei colori. I differenziatori (gruppi multi-broker, fiscalità italiana) non si vedono in prima schermata. L'Health Check porta grammatica SaaS generica (punteggio /100, pillola di livello, emoji 💡).
Detector: exit 0, 3 avvisi design-system-color (index.tsx:437, 995 #EF4444; PortfolioHealthCheckCard.tsx:431 #000); 48 sull'intero src. Analizza solo parzialmente React Native: non vede StyleSheet multi-riga né colori negli attributi JSX, nessun controllo su font, target o accessibilità. Il "pulito" non è prova di qualità. Browser: saltato (login Google + emulatori Firebase).

## Priority Issues
- [P0] Quotazioni mancanti diventano numeri finti plausibili — portfolioAggregator.ts:162,210 usa il prezzo medio (o 1) se manca la quotazione; index.tsx:262 ingoia l'errore. Fix: stato prezzo per titolo, valore in grigio con "prezzo non disponibile" e niente chip; riga "Quotazioni alle 17:35 · 2 senza prezzo"; banner errore con Riprova. → harden
- [P1] Header fisso che seppellisce i titoli — index.tsx:505-649 fuori dalla FlatList, Health Check come primo elemento della lista. Fix: tutto in ListHeaderComponent, mini-header compatto in scroll; Health Check ridotto a una riga con link o spostato dopo i gruppi. → layout
- [P1] Gerarchia diluita: teal fuori da Scalable e 3 chip su header e gruppi — PortfolioHealthCheckCard.tsx:45,69-77,123,175,299,344,421; index.tsx:519-538, 717-735. Fix: grammatica della riga titolo ovunque (un chip + riga secondaria), Health Check ricolorato con neutri/ambra/semantici. → quieter, colorize
- [P1] Accessibilità — 0 accessibilityLabel in index.tsx e Health Check; target 22-36pt (menu, cerca, torta, X, Sincronizza ora, Riprova); testo 9-11px; contrasto: rosso su chip 4,27:1, tema chiaro verde 3,24:1, rosso 3,98:1, teal 1,4-1,5:1 (colori hardcoded non seguono il tema). → audit, harden
- [P2] "Com'è andata oggi?" senza risposta — variazione giornaliera zero per Scalable; header somma solo i titoli Yahoo senza dirlo. Fix: salvare la chiusura precedente al sync; nel frattempo "Oggi (3 su 7 titoli)". → clarify

## Persona Red Flags
- Alex: niente ordinamento/peso %, colonne di valori disallineate, copia nascosta, 3 controlli sync, onScroll che riattiva il refresh.
- Sam: menu/cerca senza etichetta, gruppi senza stato espanso, asterisco XIRR letto come "asterisco", banner non annunciati, 💡 letto ad alta voce, pulsante dentro pulsante nella card liquidità.
- Casey: tutte le azioni in alto, "Sincronizza ora" 23pt accanto all'area tappabile della card, banner errore sparisce in 7s.
- Investitore dopo la chiusura: "Oggi" assente o parziale, nessun orario dei prezzi, totale che non coincide col broker (liquidità esclusa), badge "2,60% annuo" di fallback mai confermato.

## Minor Observations
"3 Price Alert Scalable Raggiunto!" (singolare/plurale, misto inglese); errori backend grezzi nel banner; stato vuoto senza pulsante; nessun marcatore di dati vecchi dopo un refetch fallito; colonna destra senza maxWidth con importi grandi; titoli in più gruppi duplicati senza segnalazione; KPI "Cassa Libera" 0% senza Scalable; stili inutilizzati (globalPL, searchButton, reorderButton, groupAssetsInner); toccare il totale del gruppo non lo espande; 11 hack `colore + '20'`.

## Questions to Consider
- Se la risposta a "come sto andando?" fosse una frase invece di tre pillole, cosa direbbe?
- Un punteggio /100 con "Rischio Elevato" appartiene alla home di uno strumento che informa e non consiglia?
- I veri differenziatori sono gruppi multi-broker e fiscalità italiana: perché la prima schermata somiglia all'app Scalable?
