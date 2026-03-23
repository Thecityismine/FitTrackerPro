# Apple Health + Watch Roadmap - March 22, 2026

## Goal

Add a focused Apple ecosystem layer that increases trust and daily utility without trying to rebuild the full phone app on the watch.

MVP outcome:

- start a workout from Apple Watch
- see the current exercise, set count, and rest timer
- quick-log sets from the watch
- sync workout state between watch and phone
- write completed workouts into Apple Health

## Important Constraint

FitTrack Pro does not currently contain an iOS or watchOS project.

That means Apple Health and Apple Watch support require a native Apple layer in addition to the current React app:

- iOS app target
- Watch app target
- Watch extension
- native sync bridge between the native app and the existing FitTrack data model

This is a product expansion, not a small frontend feature.

## Implementation Start Point

Do not wait to redesign or rebuild the current app first.

The correct next move, once current app polish is finished, is:

1. keep the current app
2. add a native iOS shell around it
3. add the Watch app and Watch extension inside that Apple project
4. then wire HealthKit, WatchConnectivity, and workout sync

This should ship as one Apple app product:

- iPhone app
- embedded Watch app
- one App Store listing

So the work is not "build a separate product first".

The work is "add the native Apple layer that the current web app does not have yet".

## Product Scope Decision

Do not build full analytics on the watch.

Build only the watch use cases that matter during training:

1. start or resume workout
2. view current exercise
3. log a set quickly
4. see rest countdown
5. move to next exercise
6. finish workout and sync back

Anything beyond that is Phase 2 or 3.

## Architecture Overview

### Current App

- React/Vite app
- Firebase-backed workout data
- routine workout state already exists in the app flow

### New Native Layer

- `FitTrack iOS` app shell
- `FitTrack Watch` app
- shared native models for workout session state
- Apple frameworks:
  - `HealthKit`
  - `WatchConnectivity`
  - `HKWorkoutSession`

### Data Direction

Phone -> Watch:

- routine id
- routine name
- ordered exercise list
- current exercise id
- completed exercises
- skipped exercises
- rest timer state

Watch -> Phone:

- set logs
- rest timer events
- exercise completion events
- workout completion state
- workout summary metadata

HealthKit:

- write completed strength workouts
- read recent workout metadata if needed for summaries
- optionally expose heart rate / calories in later phase

## Phase 0 - Foundation

Objective: create the native Apple project structure and prove basic connectivity.

Tasks:

- create iOS app target
- add Watch app target
- add Watch extension
- add required entitlements and capabilities
- add `HealthKit` capability to iOS and watch targets
- add `WatchConnectivity` session bootstrap
- define shared native workout payload schema
- document how native state maps to current Firebase workout documents

Definition of done:

- app builds on iPhone and Apple Watch simulator
- phone and watch can exchange a test payload
- HealthKit permission flow can be triggered successfully

Immediate first implementation step:

- create the iOS wrapper project and open it in Xcode

If using the current web app as the main product shell, the practical path is:

- add a native iOS wrapper around the existing app
- generate the `ios` project
- add Watch targets there
- use that Apple project as the base for all future Health and Watch work

## Phase 1 - Workout MVP

Objective: make the watch useful during a real workout.

### Watch Screens

1. `Workout Home`
   - routine name
   - `Start Workout` or `Resume Workout`

2. `Current Exercise`
   - exercise name
   - completed sets
   - target reps / weight if available
   - `Log Set`
   - `Skip`
   - `Next Exercise`

3. `Rest Timer`
   - countdown
   - `+15s`
   - `Skip Rest`

4. `Workout Summary`
   - exercises completed
   - workout duration
   - save confirmation

### MVP Logic

- start `HKWorkoutSession` with `.traditionalStrengthTraining`
- keep a live workout state object on watch
- send state deltas to phone through `WatchConnectivity`
- persist authoritative workout records through phone sync
- fall back to queued sync if phone is temporarily unavailable

Definition of done:

- user can complete a full routine from the watch
- phone receives the workout state correctly
- completed workout is saved into FitTrack and Apple Health

## Phase 2 - Apple Health Integration

Objective: make Apple Health support feel legitimate, not checkbox-level.

Tasks:

- request read/share permissions with clear copy
- save completed strength workouts to HealthKit
- store duration, calories, and workout type where available
- optionally read recent workout entries to avoid duplicate writes
- add user-facing Health status in settings

Settings surface:

- `Apple Health`
- connection status
- permission state
- last successful sync
- manual re-sync action

Definition of done:

- users can connect Health cleanly from settings
- completed workouts appear in Apple Health
- the app can explain whether sync is connected, denied, or unavailable

## Phase 3 - Watch Settings + Reliability

Objective: add the settings users actually need and harden sync behavior.

Recommended watch-related settings:

- enable / disable Apple Health sync
- default rest timer duration
- haptics on set completion
- haptics on rest timer end
- auto-start rest timer after set log
- quick-log mode toggle

Reliability work:

- offline queue for watch events
- duplicate event protection
- conflict rules for watch vs phone edits
- reconnect recovery after app relaunch

Definition of done:

- user settings survive relaunch
- watch logging still works during temporary phone disconnects
- duplicate sets or duplicate workouts are not created during sync retries

## Technical Workstreams

### 1. Native Project Setup

- create Xcode project
- configure bundle ids
- configure signing
- add capabilities and plist usage strings

### 2. Shared Workout Model

Map existing FitTrack routine flow into a native-safe payload:

- routine metadata
- exercise order
- current exercise
- set count
- rest timer
- completion state

This should mirror the current routine logic in:

- `src/pages/Routines.jsx`
- `src/pages/WorkoutPage.jsx`

### 3. Sync Contract

Define a versioned message format for phone/watch traffic.

Suggested message types:

- `workout.start`
- `workout.resume`
- `exercise.log_set`
- `exercise.skip`
- `timer.start_rest`
- `timer.end_rest`
- `workout.complete`
- `workout.sync_ack`

### 4. Settings UX

Add a dedicated Apple section inside app settings.

Recommended cards:

- `Apple Health`
- `Apple Watch`
- `Sync Status`

### 5. QA

Required test passes:

- watch starts workout while phone is nearby
- watch starts workout while phone is locked
- phone starts workout, watch resumes it
- temporary disconnect, then reconnect
- duplicate-tap protection on `Log Set`
- workout completion writes once to HealthKit and once to FitTrack

## Risks

### 1. No Native Shell Yet

This is the biggest blocker.

Without an iOS/watchOS wrapper, none of the Apple-specific roadmap can ship.

### 2. Duplicate Sync Writes

If watch and phone both persist workout changes without a clear authority model, duplicate exercise logs will appear.

Mitigation:

- phone remains the final persistence authority
- watch sends events, not independent full writes

### 3. HealthKit Permission Friction

If permissions are requested too early or explained poorly, users will deny access.

Mitigation:

- ask only when user enables Apple Health or starts watch setup
- explain exact benefit before system prompt

### 4. Overbuilding the Watch UI

A complex watch app will slow delivery and reduce reliability.

Mitigation:

- keep the watch to workout control, not analytics

## Recommended Delivery Order

1. create native iOS + watchOS project skeleton
2. prove WatchConnectivity session and test payload
3. define shared workout state contract
4. implement watch `Start / Resume Workout`
5. implement `Log Set` + rest timer
6. sync back to phone and persist through existing workout flow
7. add Apple Health save
8. add Apple Health / Apple Watch settings UI
9. run reliability and duplicate-write QA

## Definition of MVP Success

The feature is ready for an initial beta when:

- a user can start a FitTrack routine from Apple Watch
- sets can be logged on watch without opening the phone
- workout progress appears correctly on phone after sync
- one completed workout is written to Apple Health
- settings clearly show connection and permission state
- no duplicate sets or duplicate workouts are created

## Next Session Starting Point

If work resumes after a disconnect, start here:

1. review `Docs/apple-health-watch-roadmap-2026-03-22.md`
2. lock the implementation path to:
   - native iOS shell around the current app
   - embedded Watch app inside that Apple project
3. define the phone/watch sync payload shape before writing UI
4. create Phase 0 checklist for:
   - Xcode targets
   - entitlements
   - HealthKit permissions
   - WatchConnectivity bootstrap
