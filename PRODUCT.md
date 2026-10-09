# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA installabile (Expo Router + react-native-web, hosting Firebase). Le app native iOS/Android sono un'ipotesi futura, non decisa: oggi il login Google funziona solo su web.

## Users

Oggi lo usa il proprietario per il proprio portafoglio. L'obiettivo è aprirlo in futuro agli investitori retail, a partire da quelli italiani: persone che investono in ETF e azioni, spesso con piani di accumulo (PAC), su uno o più broker, e che vogliono capire davvero come sta andando il loro patrimonio senza fogli di calcolo.

Situazioni tipiche:
- **Controllo rapido** da telefono: valore totale, rendimento, andamento, in pochi secondi.
- **Analisi e pianificazione**: simulare un PAC, valutare costi e scenari, verificare la salute del portafoglio.
- **Fiscalità**: minusvalenze compensabili e report fiscale secondo il regime italiano.
- **Registro**: annotare acquisti e vendite, anche fuori da Scalable, organizzati in gruppi personali.

## Product Purpose

Un unico posto per vedere, capire e pianificare il proprio portafoglio di investimento, con numeri corretti e calcoli che un investitore italiano non trova nell'app del broker. Il successo è quando l'utente si fida dei numeri al punto da non dover più ricontrollare sul broker o su un foglio Excel.

## Positioning

- **Più fonti in un posto**: sincronizzazione automatica con Scalable Capital più transazioni inserite a mano, organizzate in gruppi definiti dall'utente (una transazione può stare in più gruppi).
- **Metriche migliori del broker**: rendimento annualizzato (XIRR), rendimento della liquidità, costi e fee drag, Monte Carlo sui PAC.
- **Fiscalità italiana**: minusvalenze e report fiscale pensati per il regime italiano.
- **Privacy e controllo**: dati dell'utente sul suo progetto Firebase, niente pubblicità né terze parti oltre ai fornitori di quotazioni.

## Operating Context

- Uso prevalente da iPhone come PWA installata, in tema scuro; anche desktop.
- Dati da Scalable Capital (posizioni, transazioni, liquidità, piani di accumulo, price alert, report fiscale) tramite Cloud Functions; quotazioni di riserva da Yahoo Finance.
- L'utente confronta spesso i numeri con l'app del broker: discrepanze anche di pochi centesimi minano la fiducia.

## Capabilities and Constraints

Funzionalità presenti:
- Dashboard con bilancio totale, rendimento totale/annualizzato/giornaliero, gruppi comprimibili, composizione per categoria, health check del portafoglio.
- Dettaglio titolo con transazioni, modifica/eliminazione, gestione gruppi.
- Ricerca titoli e aggiunta transazioni (con prezzo storico automatico).
- Integrazione Scalable Capital: login device-auth con 2FA, sincronizzazione, liquidità remunerata, piani di accumulo, price alert, report fiscale.
- Calcolatore PAC (crescita, Monte Carlo, fee drag, PAC salvati), report fiscale/minusvalenze.
- Blocco con biometria/passkey, prompt di installazione e aggiornamento PWA.

Vincoli:
- Italiano oggi, ma il prodotto va reso traducibile per altri mercati: niente testi incollati in modo non estraibile per le nuove superfici, formati numerici e date dalla localizzazione.
- Credenziali del broker solo lato server (`portfolios/{uid}/private`), mai esposte al client.
- Dati che mancano non si mostrano come zero: un dato assente va nascosto o dichiarato, mai simulato (es. variazione giornaliera non disponibile per le quotazioni Scalable).

Decisioni aperte:
- Altri broker oltre a Scalable: non deciso.
- App native: non deciso.
- Modello di accesso pubblico (registrazione aperta, inviti, a pagamento): non deciso.

## Brand Commitments

Nome attuale: "My Portfolio". Nessun logo o identità definitivi oltre alle icone PWA in `public/` e `assets/images/`. Il nome per un eventuale lancio pubblico non è deciso.

## Evidence on Hand

Nessuna testimonianza, cliente, recensione, metrica d'uso o articolo stampa. Le superfici future non devono inventarne. Non esiste alcun accordo o affiliazione con Scalable Capital: non suggerirne.

## Product Principles

1. **I numeri prima di tutto**: correttezza e coerenza tra schermate valgono più di qualsiasi effetto; lo stesso valore deve essere identico ovunque.
2. **Onestà sui dati**: ogni stima, estrapolazione o dato mancante è dichiarato (come l'asterisco sullo XIRR sotto l'anno).
3. **Un colpo d'occhio, poi la profondità**: la risposta "come sto andando?" arriva subito; analisi e fiscalità sono a un tocco, non in mezzo.
4. **I dati sono dell'utente**: privacy di default, nessuna esposizione di credenziali, nessun uso dei dati per altri scopi.
5. **Strumento informativo, non consulenza** _(dedotto, da confermare)_: l'app mostra e calcola, non consiglia investimenti.
