# FitTrack Pro

Personal fitness tracker — React + Firebase + Vite PWA

## Stack
- **React 18** + React Router 6
- **Firebase** — Auth, Firestore (offline-enabled)
- **Tailwind CSS** — Dark theme design system
- **Recharts** — Volume & metrics charts
- **Vite** + PWA plugin — installable on iOS/Android
- **Vercel** — Deployment

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Firebase
```bash
cp .env.example .env.local
```
Fill in your Firebase credentials in `.env.local`

**Firebase Console setup needed:**
- Authentication → Sign-in methods → Enable: **Email/Password** + **Google**
- Firestore → Create database (production mode)
- Firestore → Rules → paste from `firestore.rules`

### 3. Run locally
```bash
npm run dev
```

### 4. Deploy to Vercel
Push to GitHub — Vercel auto-deploys on every commit.

Add these environment variables in **Vercel Dashboard → Settings → Environment Variables**:
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

---

## Project Structure
```
src/
  components/
    layout/       ← Header, BottomNav, PageWrapper
    charts/       ← VolumeChart, WeightChart (Phase 1)
    workout/      ← SetRow, RestTimer, AddExerciseModal (Phase 2)
    metrics/      ← MetricCard, EntryModal (Phase 3)
  pages/          ← Dashboard, WorkoutPage, Routines, Muscles, BodyMetrics, CalendarLog
  context/        ← AuthContext, TimerContext
  firebase/       ← config.js, collections.js
  utils/          ← volumeCalc.js (Phase 2)
```

## Build Phases
- **Phase 1** (current): Scaffold, Auth, all page shells, rest timer, bottom nav
- **Phase 2**: Live Firestore workout logging, volume charts
- **Phase 3**: Body metrics entry + trend charts
- **Phase 4**: PWA polish, calendar, PRs, multi-user profiles

---

## Family / Multi-User
Each family member creates their own account (Google or email).
All data is isolated under `users/{uid}/...` — zero overlap between accounts.
