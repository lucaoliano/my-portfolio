---
name: My Portfolio
description: Cruscotto tascabile per il portafoglio di investimento, scuro e leggibile in un colpo d'occhio.
colors:
  night-canvas: "#121212"
  graphite-card: "#1E1E1E"
  smoke-line: "#2C2C2C"
  mist-text: "#F3F4F6"
  ash-text: "#9CA3AF"
  gain-green: "#00D166"
  loss-red: "#FF453A"
  scalable-teal: "#28EBCF"
  signal-amber: "#F59E0B"
  paper-canvas: "#F9FAFB"
  paper-card: "#FFFFFF"
  paper-line: "#E5E7EB"
  slate-text: "#334155"
  slate-muted: "#64748B"
  gain-green-light: "#059669"
  loss-red-light: "#DC2626"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    fontFeature: "tnum"
  headline:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    fontFeature: "tnum"
  title:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  metric:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "25px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gain-green}"
    textColor: "#000000"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "50px"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.loss-red}"
    rounded: "{rounded.pill}"
    height: "50px"
  button-scalable:
    backgroundColor: "rgba(40, 235, 207, 0.12)"
    textColor: "{colors.scalable-teal}"
    typography: "{typography.metric}"
    rounded: "{rounded.xs}"
    padding: "4px 8px"
  input:
    backgroundColor: "{colors.smoke-line}"
    textColor: "{colors.mist-text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "50px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.graphite-card}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip-metric-gain:
    backgroundColor: "rgba(0, 209, 102, 0.125)"
    textColor: "{colors.gain-green}"
    typography: "{typography.metric}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  chip-metric-loss:
    backgroundColor: "rgba(255, 69, 58, 0.125)"
    textColor: "{colors.loss-red}"
    typography: "{typography.metric}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  segmented-control:
    backgroundColor: "{colors.smoke-line}"
    rounded: "{rounded.sm}"
    padding: "4px"
---

# Design System: My Portfolio

## Overview

**Creative North Star: "Il Cruscotto Tascabile"**

Un cruscotto che sta in tasca: si apre dall'iPhone, si legge in tre secondi, si richiude. La domanda "come sto andando?" ha sempre la risposta più grande dello schermo: il bilancio totale in alto, poi il rendimento in colore, poi i dettagli a un tocco. Tutto il resto (analisi, fiscalità, PAC) vive un livello sotto e non compete con la risposta principale.

Il mondo è scuro per default (canvas quasi nero, card grafite a strati) con un tema chiaro equivalente. Il colore è informazione: verde e rosso dicono guadagno e perdita, il verde acqua dice "viene da Scalable", l'ambra dice "attenzione". Nessun colore è decorativo. La forma è morbida e tattile: angoli generosi, pulsanti a pillola, card arrotondate che si toccano con il pollice.

La densità è alta ma ordinata: molti numeri per schermata, sempre in cifre tabulari e allineati a destra, con le etichette in grigio cenere e i valori in bianco nebbia.

**Key Characteristics:**
- Scuro di default, tema chiaro con gli stessi ruoli.
- Il colore codifica significato (guadagno, perdita, fonte, allerta), mai decorazione.
- Cifre tabulari ovunque ci siano importi o percentuali.
- Forme morbide: card a 16px, campi a 8px, pulsanti principali a pillola.
- Font di sistema (SF Pro su iPhone): si sente nativo nella PWA installata.

## Colors

Un canvas neutro e scuro su cui solo i numeri accendono il colore.

### Primary
- **Gain Green** (gain-green): rendimento positivo, pulsante d'azione principale (testo nero sopra), indicatori di successo. Nel tema chiaro diventa **Gain Green Light** (gain-green-light) per il contrasto.

### Secondary
- **Loss Red** (loss-red): rendimento negativo, azioni distruttive (bordo e testo, mai riempimento), errori. Nel tema chiaro **Loss Red Light** (loss-red-light).

### Tertiary
- **Scalable Teal** (scalable-teal): esclusivamente l'integrazione Scalable Capital: pulsante "Sincronizza", badge SCALABLE sulle transazioni, card della liquidità, chip "Scalable" nell'header.
- **Signal Amber** (signal-amber): price alert in avvicinamento e avvisi non bloccanti.

### Neutral
- **Night Canvas** (night-canvas): sfondo dell'app in tema scuro.
- **Graphite Card** (graphite-card): superfici di card, righe dei titoli, fogli modali.
- **Smoke Line** (smoke-line): bordi, divisori, sfondo di campi e controlli segmentati.
- **Mist Text** (mist-text): testo principale e importi; volutamente non bianco puro.
- **Ash Text** (ash-text): etichette, dettagli secondari, note a piè di pagina.
- **Paper Canvas / Paper Card / Paper Line / Slate Text / Slate Muted**: gli stessi ruoli nel tema chiaro.

### Named Rules
**The Meaning-Only Color Rule.** Verde e rosso compaiono solo per dire guadagno/perdita o confermare/distruggere. Un elemento colorato che non porta questo significato è un errore.

**The Teal Belongs to Scalable Rule.** Il verde acqua identifica ciò che arriva dal broker. Non si usa come accento generico, link o stato di selezione.

**The No-Fake-Zero Rule.** Un dato assente non si colora: se manca (es. variazione giornaliera non disponibile), il chip non viene mostrato, invece di un "+0,00%" verde.

## Typography

**Display Font:** font di sistema (SF Pro su iOS/macOS, Roboto su Android, system-ui altrove)
**Body Font:** lo stesso font di sistema

**Character:** un'unica famiglia nativa, modulata solo da peso e dimensione: si legge come un'app iOS, non come un sito.

### Hierarchy
- **Display** (700, 40px): valore della singola posizione nella schermata di dettaglio.
- **Headline** (700, 32px): bilancio totale in dashboard.
- **Title** (700, 20px): nomi dei gruppi e titoli di sezione; i titoli di schermata negli header sono 18px a peso 600.
- **Body** (400–600, 15–16px): nomi dei titoli, valori dei campi, testo dei pulsanti.
- **Label** (500–600, 12–14px): etichette dei campi, dettagli sotto il nome ("41 quote · PM €84,88"), sottotitoli.
- **Metric** (700, 11–12px, tabulare): i chip di rendimento (Tot / Ann / Oggi).

### Named Rules
**The Tabular Figures Rule.** Ogni importo o percentuale usa cifre tabulari (`fontVariant: ['tabular-nums']`), così le colonne di numeri restano allineate.

**The Locale Number Rule.** Gli importi passano sempre da `formatNumber` / `formatSignedCurrency`: separatore delle migliaia forzato, segno prima della valuta ("-€231,88"), mai `toFixed` a mano.

## Layout

Colonna unica a tutta larghezza pensata per il telefono, con margini laterali di 16–20px. La dashboard è una lista verticale: header con bilancio e chip, card della liquidità Scalable, health check, poi i gruppi come blocchi bordati e comprimibili, ciascuno con le righe dei titoli.

Il ritmo usa multipli di 4: 4px tra chip, 8–12px dentro i gruppi, 16px di padding nelle card e tra i blocchi, 24px tra sezioni dei form. Le righe dei titoli seguono sempre lo schema avatar (48px) · nome e dettagli (flessibile, fino a 2 righe) · valori allineati a destra.

I form (aggiungi/modifica transazione, gruppi) sono schermate a scheda con header a tre zone (chiudi · titolo centrato · spazio) separato da un bordo sottile, contenuto con padding 20px, azioni principali a tutta larghezza in fondo.

### Named Rules
**The Answer-First Rule.** In ogni schermata il numero che risponde alla domanda principale è l'elemento più grande e sta in alto; i chip di rendimento lo seguono subito sotto.

## Elevation & Depth

Profondità soprattutto tonale: canvas, card e campi sono tre gradini di grigio (night-canvas → graphite-card → smoke-line). Le ombre sono rare e morbide, usate solo per sollevare elementi attivi o fluttuanti.

### Shadow Vocabulary
- **Segment lift** (`0 2px 2px rgba(0,0,0,0.2)`): il segmento attivo di un controllo segmentato.
- **Floating soft** (`0 2px 8px rgba(0,0,0,0.3)`): banner e prompt che galleggiano sul contenuto (installazione, aggiornamento, sync).

### Named Rules
**The Tonal-First Rule.** Per separare due superfici si cambia tono o si aggiunge un bordo smoke-line da 1px; l'ombra è riservata a ciò che si muove o fluttua.

## Shapes

Forme morbide e tattili. Card e gruppi a 16px, card interne e righe di menu a 12px, campi e controlli segmentati a 8px, chip di rendimento a 6px. Le azioni principali di una schermata sono pillole alte 50px (raggio 25px). L'avatar dei titoli è un cerchio pieno da 48px con le iniziali del nome. I bordi sono sempre da 1px.

## Components

### Buttons
- **Shape:** pillola (25px) a 50px d'altezza per le azioni principali; 8px per i pulsanti affiancati a un campo.
- **Primary:** riempimento Gain Green, testo nero a peso 600, a tutta larghezza.
- **Destructive:** contorno 1px Loss Red, testo e icona Loss Red, sfondo trasparente.
- **Scalable:** chip compatto con fondo teal al 12% e testo teal a 11px, icona di sync a sinistra.
- **Disabled / Loading:** opacità 0.5–0.7; durante il caricamento lo spinner sostituisce l'etichetta.

### Chips
- **Metric chip:** fondo del colore semantico al ~12% (suffisso `20` sull'hex), testo dello stesso colore a 11–12px, peso 700, cifre tabulari, raggio 6px. Formato "Tot: +€4.143,68 (+7,24%)".
- **Source badge:** "SCALABLE" maiuscolo su fondo teal tenue accanto alla data della transazione.

### Cards / Containers
- **Corner Style:** 16px (gruppi, card in evidenza), 12px (card interne, righe azione).
- **Background:** graphite-card; i gruppi della dashboard hanno fondo trasparente e bordo smoke-line.
- **Shadow Strategy:** nessuna a riposo (vedi The Tonal-First Rule).
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** fondo smoke-line, nessun bordo, raggio 8px, altezza 50px, testo 16px; etichetta in Ash Text sopra.
- **Numeri:** tastiera decimale, formato italiano con virgola ("84,88").
- **Date:** campo data nativo del browser con lo stesso stile.

### Navigation
- Header di schermata a tre zone con titolo centrato a 18px; icona chiudi (X) per i fogli, freccia indietro per i dettagli.
- La dashboard ha menu hamburger a sinistra, titolo grande a sinistra, chip Scalable e ricerca a destra.

### Asset Row (signature)
La riga titolo: avatar circolare con iniziali, nome su due righe, dettagli in Ash Text ("41 quote · PM €84,88", "Attuale €99,14"); a destra il valore della posizione, un solo chip di rendimento totale e una riga secondaria "Ann. +28,15%* · Oggi +0,42%" colorata per segno.

## Do's and Don'ts

### Do:
- **Do** usare i token di `src/theme/colors.ts` tramite `useAppTheme()`, mai colori neutri scritti a mano.
- **Do** mettere `tabular-nums` su ogni importo e percentuale.
- **Do** formattare importi con `formatNumber` / `formatSignedCurrency`.
- **Do** tenere le azioni principali come pillole Gain Green a tutta larghezza con testo nero.
- **Do** dichiarare stime ed estrapolazioni con asterisco e nota in Ash Text (come lo XIRR sotto l'anno).

### Don't:
- **Don't** usare Scalable Teal fuori da ciò che riguarda l'integrazione Scalable.
- **Don't** mostrare un dato mancante come zero colorato.
- **Don't** usare bianco o nero puro per testo o sfondi del tema (eccezione: il testo nero sui pulsanti Gain Green).
- **Don't** impilare più di un chip colorato per riga titolo: il rendimento totale ha il chip, le altre metriche vanno in testo secondario.
- **Don't** troncare un ISIN o un ticker in un avatar ("IE0…"): usare le iniziali del nome.
