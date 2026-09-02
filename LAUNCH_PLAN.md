# FitTrack Pro — App Store Launch Plan

**Target:** Apple App Store launch within 2 months, Google Play to follow  
**Chosen stack:** Capacitor (wrap existing React PWA, Swift/Kotlin plugins for platform APIs)  
**Apple Watch:** Phase 2 — native SwiftUI after iPhone launch validates demand  
**Android:** Architect for it now, launch iPhone first  
**Domain:** fittrackerpro.live  

---

## Locked Decisions

| Decision | Answer |
|---|---|
| Bundle ID / package name | `com.fittrackerpro.app` |
| App name | **FitTrack Pro** |
| Developer name (stores) | The City Is Mine |
| Support email | support@fittrackerpro.live |
| Privacy Policy URL | fittrackerpro.live/privacy |
| Terms of Use URL | fittrackerpro.live/terms |
| iOS product IDs | `com.fittrackerpro.app.pro.monthly` / `com.fittrackerpro.app.pro.yearly` |
| Android product IDs | `pro_monthly` / `pro_yearly` |
| Monthly price | $5.99/mo with 7-day free trial |
| Yearly price | $44.99/yr |
| Backend auth | Firestore `users/{uid}/subscription` — not Custom Claims in Phase 1 |
| Delete account | Immediate — delete Firebase Auth + all Firestore user data, no grace period |
| Launch order | iPhone → Android |

---

## Architecture

| Layer | Technology |
|---|---|
| App UI | Existing React + Tailwind (unchanged, shared) |
| Native runtime | Capacitor (iOS + Android) |
| Subscriptions — iOS | Swift plugin (StoreKit 2) |
| Subscriptions — Android | Kotlin plugin (Google Play Billing) |
| Health sync — iOS | Swift plugin (HealthKit) |
| Health sync — Android | Kotlin plugin (Health Connect) |
| Apple Watch (Phase 2) | Native watchOS / SwiftUI |
| Backend entitlement | Firestore `users/{uid}/subscription` |

### Platform abstraction rule
React never calls native plugins directly. All platform features go through shared interfaces:

```
src/services/billing/BillingService.ts           ← interface
src/services/billing/BillingService.ios.ts       ← StoreKit 2
src/services/billing/BillingService.android.ts   ← Google Play Billing
src/services/health/HealthService.ts             ← interface
src/services/health/HealthService.ios.ts         ← HealthKit
src/services/health/HealthService.android.ts     ← Health Connect
src/services/EntitlementService.ts               ← single source of truth for Pro status
```

**Rule:** All premium logic flows through `EntitlementService`. No scattered `isPremium` checks. Every gated feature uses `FeatureGate` or `useEntitlement()`.

UI copy says **"Health Sync"** not "Apple Health". Never references a specific store.

---

## V1 Scope (iPhone launch)

### In
- iPhone app (Capacitor)
- Subscriptions + paywall
- 7-day free trial
- HealthKit basics (read/write workouts, read body weight)
- Polished onboarding
- Core workout logging (already built)
- Body metrics (already built)
- Recovery (already built)
- Progress / calendar (already built)
- Sign in with Apple (required — Apple rejects apps with third-party sign-in that lack it)
- Delete account flow (Apple requires this)
- Privacy Policy + Terms of Use live at fittrackerpro.live

### Phase 2 (post-launch)
- Apple Watch companion (native SwiftUI)
- Android release
- Health Connect (Android health sync)
- Advanced AI coaching features
- Deeper automation
- Social / community features

---

## Free vs Pro

### Free (always)
- Workout logging
- Routine builder
- Basic recovery summary
- Basic progress history
- Body metrics (manual entry)
- Calendar log

### Pro (subscription required)
- Monthly AI Insights
- Advanced recovery intelligence
- Smart recommendations
- Volume trends + advanced analytics
- Scale photo scan
- Apple Watch sync *(Phase 2)*
- Advanced Health integrations

**On subscription lapse:**
- User keeps all historical data
- User can view previously generated AI reports
- New AI report generation is blocked until subscription restores
- Advanced features revert to free-tier version — nothing is hidden, just locked
- User data is never deleted based on subscription state

---

## Subscription Firestore Schema

Path: `users/{uid}/subscription`

```json
{
  "plan": "pro_monthly",
  "status": "trialing",
  "store": "apple",
  "productId": "com.fittrackerpro.app.pro.monthly",
  "trialEndsAt": "<Timestamp>",
  "currentPeriodEnd": "<Timestamp>",
  "isActive": true
}
```

`isActive` = `status === "trialing" || status === "active"`. Backend AI endpoints check this field. Free users are rate-limited or blocked before server-side AI runs.

---

## Paywall Triggers (3 approved — no others)

| # | Trigger | Copy |
|---|---|---|
| 1 | After first completed workout | "See your progress insights" — show paywall once, not repeatedly |
| 2 | Feature tap (hard gate) | Monthly Insights · AI recommendations · Advanced recovery · Scan feature — go straight to paywall on tap |
| 3 | Soft nudge after 3–4 workouts | Light in-context reminder — not a modal, not aggressive |

**Never show paywall on first app open.**

---

## Data Ownership

| Data type | Lives in |
|---|---|
| Auth | Firebase Auth |
| User profile | Firestore `users/{uid}` |
| Subscription status | Firestore `users/{uid}/subscription` |
| Workout sessions | Firestore `users/{uid}/sessions/{id}` |
| Routines | Firestore `users/{uid}/routines/{id}` |
| AI reports | Firestore + Firebase Functions |
| Active workout (in-progress) | `localStorage` — already in `ActiveWorkoutContext` |
| Rest timer state | `localStorage` — already in `TimerContext` |
| Subscription entitlement cache | `localStorage` — add for Phase 2 |
| Health data | HealthKit / Health Connect (source of truth stays in Health) |

---

## Offline Behavior

| Scenario | Behavior |
|---|---|
| Start / log workout offline | Allowed — active workout is already in `localStorage` |
| Finish workout offline | Queue Firestore write, retry on reconnect |
| Subscription check offline | Use cached `localStorage` entitlement — never false-downgrade mid-session |
| AI insights offline | Show last generated report; block new generation until online |
| Health sync offline | Queue and sync when online |

**Rule:** Core logging must work offline, no exceptions. A workout app that breaks in a basement gym is not a workout app.

---

## Auth Flow

**Current:** Google Sign In + Email/Password  
**Add for v1:** Sign in with Apple  
**Why required:** Apple mandates Sign in with Apple for any app offering third-party sign-in. App Review will reject without it.

**Sequence:**
1. Open app → onboarding / value screens
2. First meaningful save → require sign-in
3. Auth options: Apple Sign In · Google Sign In · Email/Password

---

## Onboarding

**Already in Setup.jsx:** weight, height, workout frequency, units, goal, DOB, sex  
**Add:**

| Question | Used for |
|---|---|
| Primary focus (strength / cardio / both) | Routine suggestions |
| Equipment access (full gym / home / bodyweight) | Routine suggestions |
| Experience level (beginner / intermediate / advanced) | AI tone, default weights |

After onboarding: generate initial routine suggestion + first recovery baseline so the dashboard is not empty on day one.

---

## Analytics Events

**Tool:** Firebase Analytics (already in stack)

| Event | When |
|---|---|
| `onboarding_completed` | Setup.jsx finished |
| `workout_started` | Workout begins |
| `workout_completed` | Workout saved |
| `paywall_viewed` | Paywall shown |
| `trial_started` | 7-day trial begins |
| `subscription_converted` | Paid subscription starts |
| `subscription_lapsed` | Status → expired/canceled |
| `subscription_restored` | Restore purchases tapped |
| `feature_used_recovery` | Recovery page opened |
| `feature_used_insights` | AI Insights opened |
| `feature_used_scan` | Smart scan opened |
| `health_sync_enabled` | Health permission granted |
| `health_sync_denied` | Health permission denied |
| `workout_resumed_after_reopen` | App reopened with active workout |

---

## Permissions Copy

| Permission | Pre-prompt explanation |
|---|---|
| Health read | "FitTrack Pro can read your workouts and body weight from your Health app to keep your data in sync." |
| Health write | "FitTrack Pro will save your completed workouts to your Health app so they appear alongside your other fitness data." |
| Camera | "Used to scan your scale display and log body weight automatically. Photos are not stored." |
| Notifications | "Get reminders to stay on your schedule and see when your weekly AI summary is ready." |

**Rules:** Always show explanation before OS prompt. Never request camera before scan is attempted. Never request notifications on first launch.

---

## Empty + Error States

Every main screen needs all four before launch:

| Screen | Empty | Loading | Error | Offline |
|---|---|---|---|---|
| Dashboard | "Log your first workout to start tracking." | Skeleton cards | "Could not load. Pull to refresh." | Show cached + offline badge |
| Routines | "You haven't built a routine yet." | Skeleton list | Retry button | Show cached |
| Active workout | — | — | "Could not save. Will retry when connected." | Allow offline logging |
| Progress / Calendar | "No workouts logged yet." | Skeleton chart | Retry | Show cached |
| Body metrics | "Add your first measurement." | Skeleton | Retry | Show cached |
| Recovery | "Log a few workouts to see guidance." | Skeleton | Retry | Show last known state |
| AI Insights | "Your first summary generates after 3 workouts." | Spinner | "Could not generate. Try again." | Show last report |
| Health sync | — | — | "Health access unavailable. Check Settings." | Graceful skip |

---

## Notification Strategy (Phase 2 — define now, build later)

| Notification | Trigger |
|---|---|
| Workout reminder | User-set time on scheduled days |
| Streak at risk | No workout by 8pm on an active day |
| Weekly AI summary ready | After report generates |
| Body metrics check-in | Weekly, if no entry in 7 days |
| Recovery recommendation | After hard training day |

**Rules:** Request notification permission after first completed workout — not on launch. All notifications user-controllable per type.

---

## Support and Legal

- [ ] Privacy Policy written + live at fittrackerpro.live/privacy
- [ ] Terms of Use written + live at fittrackerpro.live/terms
- [ ] Support email: support@fittrackerpro.live
- [ ] Delete account flow built in-app (Apple requires)
  - Confirm modal → delete Firebase Auth + all Firestore user data → sign out
  - Immediate, no grace period
- [ ] Restore purchases button on paywall + in Profile/Settings
- [ ] Subscription management link (opens OS subscription settings)

---

## Testing Checklist (do not skip before any submission)

- [ ] New user — full onboarding flow
- [ ] Returning user — data loads, no re-onboarding
- [ ] Offline workout — complete and save without network
- [ ] Sync after offline — Firestore write retries correctly
- [ ] Start free trial — Pro features unlock immediately
- [ ] Trial ends — reverts to free, historical data intact, old reports still viewable
- [ ] Active subscription — all Pro features available
- [ ] Subscription canceled — reverts at period end
- [ ] Restore purchases — prior subscription recognized
- [ ] Health permission granted — sync works
- [ ] Health permission denied — app works fine, no crash
- [ ] Camera permission denied — scan fails gracefully
- [ ] App killed during active workout — state restores from localStorage
- [ ] Subscription check fails (offline) — cached entitlement used, no false downgrade
- [ ] Delete account — Auth + Firestore data removed, user signed out

---

## Phases

### Phase 1 — Capacitor Setup
*Get a native iOS build running. Wire Android in the same pass.*

**iOS**
- [ ] Install `@capacitor/core` `@capacitor/ios` `@capacitor/cli`
- [ ] `capacitor.config.ts` — appId: `com.fittrackerpro.app`, appName: FitTrack Pro
- [ ] `npx cap add ios`
- [ ] `npm run build && npx cap sync`
- [ ] Verify on iOS simulator + physical device
- [ ] App icons + splash screen
- [ ] iOS entitlements: In-App Purchase, HealthKit
- [ ] Confirm Firebase Auth, Firestore, all existing features work in native shell
- [ ] Confirm PWA service worker doesn't conflict with Capacitor

**Android**
- [ ] Install `@capacitor/android`
- [ ] `npx cap add android`
- [ ] Package name: `com.fittrackerpro.app`
- [ ] App icons + splash screen
- [ ] Google Play Billing + Health Connect permissions in manifest
- [ ] Verify on emulator + physical device
- [ ] Confirm all features work on Android

---

### Phase 2 — Subscriptions + Paywall + Sign in with Apple

**App Store Connect**
- [ ] App record (`com.fittrackerpro.app`)
- [ ] Subscription group "FitTrack Pro"
- [ ] Monthly product with 7-day trial ($5.99)
- [ ] Yearly product ($44.99)
- [ ] Sandbox test accounts

**Google Play Console**
- [ ] App created (`com.fittrackerpro.app`)
- [ ] Subscription products with trial configured
- [ ] Internal testing track

**iOS — `SubscriptionPlugin.swift` (StoreKit 2)**
- [ ] Product fetch
- [ ] Purchase flow with 7-day intro offer
- [ ] Restore purchases
- [ ] Entitlement check on app launch
- [ ] Offline cache (`localStorage`)
- [ ] On purchase: write to `users/{uid}/subscription` (`store: "apple"`, `isActive: true`)

**Android — `BillingPlugin.kt` (Google Play Billing)**
- [ ] Product fetch, purchase, acknowledge, restore
- [ ] Entitlement check on launch
- [ ] On purchase: write to `users/{uid}/subscription` (`store: "google"`, `isActive: true`)

**React service layer**
- [ ] `BillingService` interface + `.ios.ts` + `.android.ts`
- [ ] `EntitlementService` — reads Firestore, caches locally, single source of truth
- [ ] `PurchaseState`: `'loading' | 'free' | 'trialing' | 'pro' | 'error'`
- [ ] `useEntitlement()` hook
- [ ] `FeatureGate` component

**Paywall UI**
- [ ] Monthly / yearly toggle
- [ ] 7-day trial prominent
- [ ] Prices from native billing (never hardcoded)
- [ ] Feature list
- [ ] Restore purchases
- [ ] Terms + Privacy links
- [ ] "Start Free Trial" / "Start Pro" CTA
- [ ] "Not now" close

**Backend**
- [ ] AI endpoints check `isActive` before running
- [ ] App Store Server Notifications handler (iOS)
- [ ] Google Play Real-time Developer Notifications handler (Android)

**Sign in with Apple**
- [ ] Enable in Firebase Auth
- [ ] Add Apple Sign In button to Login.jsx
- [ ] Wire up credential flow via Capacitor plugin or Firebase SDK

**Feature gates — wire to:**
- [ ] Monthly AI Insights
- [ ] Advanced recovery intelligence
- [ ] Smart recommendations
- [ ] Scale photo scan
- [ ] Advanced volume analytics

---

### Phase 3 — Health Sync

**iOS — `HealthKitPlugin.swift`**
- [ ] Minimum permissions (body mass, workouts, active energy)
- [ ] Read workouts + body weight
- [ ] Write completed workouts
- [ ] `NSHealthShareUsageDescription` + `NSHealthUpdateUsageDescription` in Info.plist

**Android — `HealthConnectPlugin.kt`**
- [ ] Minimum permissions
- [ ] Read exercise sessions + body weight
- [ ] Write exercise sessions
- [ ] Health Connect permissions in manifest

**React**
- [ ] `HealthService` interface + `.ios.ts` + `.android.ts`
- [ ] Pre-prompt explanation screen before OS permission prompt
- [ ] Auto-fill body metrics from Health
- [ ] Write workout to Health on save
- [ ] Import Health workout summaries

---

### Phase 4 — Submission Polish

**iOS**
- [ ] App Store Connect listing
- [ ] Privacy nutrition labels
- [ ] iPhone 6.9" + 6.5" screenshots
- [ ] Demo account + reviewer notes
- [ ] TestFlight — full testing checklist passed

**Android**
- [ ] Google Play listing + data safety section
- [ ] Screenshots
- [ ] Internal testing track — full testing checklist passed

**Shared**
- [ ] Privacy Policy live at fittrackerpro.live/privacy
- [ ] Terms live at fittrackerpro.live/terms
- [ ] Delete account flow in-app
- [ ] Restore purchases in Profile/Settings

---

### Phase 5 — Apple Watch (Post-Launch)
*Native SwiftUI. After iPhone launch validates demand.*

Watch v1: start/resume · log sets · rest timer · finish + sync  
Not in v1: analytics, body metrics, routine editor, photo workflows

- [ ] watchOS target in Xcode
- [ ] Shared Swift package (workout models)
- [ ] Watch Connectivity sync layer
- [ ] Local workout cache on Watch
- [ ] Completed sets sync to iPhone
- [ ] Screens: launcher · active workout · next-up · finish

---

## Session Log

| Date | Phase | Work Done |
|---|---|---|
| 2026-04-14 | — | All pre-development decisions locked |
