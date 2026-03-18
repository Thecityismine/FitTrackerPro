# FitTrack Pro

Personal fitness tracker built with React, Firebase, and Vite PWA.

## Stack
- React 18 + React Router 6
- Firebase Auth, Firestore, Storage, Functions
- Tailwind CSS
- Recharts
- Vite + `vite-plugin-pwa`
- Vercel for the web app

## Setup

### 1. Install web dependencies
```bash
npm install
```

### 2. Configure Firebase web env
```bash
cp .env.example .env.local
```

Fill in your Firebase web app credentials in `.env.local`.

Firebase console setup:
- Enable `Email/Password` and `Google` sign-in
- Create Firestore
- Apply [firestore.rules](c:/Users/gmedi/Desktop/FitTrack%20Pro/firestore.rules)
- Apply [storage.rules](c:/Users/gmedi/Desktop/FitTrack%20Pro/storage.rules)

### 3. Run the web app
```bash
npm run dev
```

### 4. Deploy the web app
Push to GitHub and Vercel will deploy the frontend.

Required Vercel env vars:
```bash
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

### 5. Configure Firebase Functions for AI
AI requests now run through Firebase Functions instead of direct browser calls.

Install Function dependencies:
```bash
cd functions
npm install
cd ..
```

Set the Anthropic provider secret:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Deploy the backend:
```bash
firebase deploy --only functions
```

The frontend stays on Vercel. The AI proxy runs on Firebase Functions.

## Project Structure
```text
src/
  components/
  context/
  firebase/
  pages/
  utils/
functions/
  index.js
public/
scripts/
```

## Multi-User
Each family member creates their own account. Data stays isolated under `users/{uid}/...`.
