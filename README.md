# My Portfolio

Installable web app (PWA) and mobile-ready client for tracking investment portfolios, analyzing performance, simulating savings plans (PAC), and estimating Italian investment taxes — built with **Expo Router**, **React Native Web**, and **Firebase**.

## Features

- **Portfolio Dashboard**: Total net worth (invested + cash), total return, annualized return (**XIRR**), daily change, Time-Weighted Return (**TWR**) trend chart, asset category breakdown, and a portfolio health check.
- **Multi-Portfolio & Custom Groups**: Manage multiple portfolios and organize transactions across custom groups.
- **Assets & Transactions**: Symbol search, automatic historical prices, and full transaction management (add, edit, delete) with weighted-average cost basis and FX effect in EUR.
- **Scalable Capital Integration**: Optional broker connection via Firebase Cloud Functions and MCP (`functions/src/scalableMcp.ts`) supporting device-auth / OAuth login, server-side credential storage, portfolio & transaction sync, remunerated cash interest, savings plans (PAC), price alerts, and tax reports.
- **PAC Simulator**: Compound growth projections, Monte Carlo simulation, fee-drag comparison, and saved scenarios.
- **Italian Fiscal Tools**: Realized gains/losses and recoverable tax losses (*minusvalenze*), plus estimated wealth taxes (*Imposta di bollo* and *IVAFE*).
- **Security & PWA**: Google Sign-In, optional WebAuthn/biometric lock screen, Firestore offline persistence (IndexedDB), dark/light themes, and Workbox service worker support.

## Tech Stack

- **Frontend**: Expo (~58), Expo Router, React 19, React Native Web, TypeScript
- **Backend & Storage**: Firebase Auth, Cloud Firestore, Firebase Hosting, Cloud Functions v2 (Node.js 24)
- **Market & Broker Data**: `yahoo-finance2` and `@modelcontextprotocol/sdk` inside Cloud Functions
- **PWA**: `workbox-cli` & `workbox-window`
- **Testing**: Playwright (`@playwright/test`) with `monocart-reporter` coverage, plus TypeScript scripts run against Firebase Emulators

## Project Structure

```text
src/
  app/            # Expo Router screens (dashboard, asset detail, PAC, tax, settings, integrations)
  components/     # Charts, cards, forms, prompts, and UI primitives
  config/         # Firebase initialization & local emulator wiring
  constants/      # Asset classes and Firestore collection names
  hooks/          # Data, portfolio overview, quotes, history, biometrics, Scalable hooks
  services/       # Yahoo Finance, historical prices, Scalable MCP client wrappers
  theme/          # Dark/light color tokens, spacing, radius, shadows, typography
  utils/          # XIRR, TWR, PAC/Monte Carlo, tax loss, wealth tax, health check, WebAuthn
functions/
  src/            # Firebase Cloud Functions (Yahoo Finance proxy & Scalable MCP integration)
e2e/              # Playwright end-to-end test suites
scripts/          # Calculation checks and emulator E2E scripts
```

## Getting Started

### Prerequisites

- **Node.js 24** and **npm**
- **Firebase CLI** (`firebase-tools`) for local emulators and deployment

### 1. Install Dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Firebase project settings:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
EXPO_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
```

> In development (`__DEV__`), the app automatically connects to the local Firebase Emulators (Firestore on `8080`, Functions on `5001`, Auth on `9099`) unless `EXPO_PUBLIC_DISABLE_EMULATORS=true` is set.

### 3. Run Locally

Start the Firebase Emulators in one terminal:

```bash
npm run serve
```

Start the Expo web dev server in another terminal:

```bash
npm run web
```

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Start the Expo development server |
| `npm run web` | Start Expo for web |
| `npm run serve` | Start Firebase Emulators (importing/exporting `./emulator-data`) |
| `npm run lint` | Run `expo lint` |
| `npm run typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm run build` | Export web build (`dist/`) and generate Workbox service worker |
| `npm run test:calc` | Run financial calculation verification script |
| `npm run test:e2e` | Run portfolio E2E script with Firebase Auth & Firestore emulators |
| `npm run test:e2e:browser` | Run Playwright browser tests with Firebase emulators |
| `npm run deploy:all` | Build web bundle and deploy Hosting, Functions, Rules, and Indexes |

## Security Note

Broker session credentials for Scalable Capital are stored server-side under `portfolios/{userId}/private/*` and accessed exclusively by Firebase Cloud Functions using the Admin SDK. Firestore security rules in `firestore.rules` restrict client writes on `integration_scalable` to non-sensitive display/sync preferences only.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
