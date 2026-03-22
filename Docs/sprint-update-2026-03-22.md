# Sprint Update - March 22, 2026

## Scope

This update covers work landed between March 20, 2026 and March 22, 2026, plus the current in-progress polish pass still sitting in the working tree.

## Shipped

- Progress tab renamed and repositioned from the old log framing to a more insight-driven experience.
- Month view now acts like a summary surface instead of a plain calendar, with stronger activity, consistency, and intensity signals.
- Selected-day progress cards were polished to make workout summaries easier to scan.
- Workout drill-in was improved with better exercise row hierarchy, clearer expansion states, workout insight panels, and a replay CTA.
- Monthly progress insights were added, along with a smarter progress mode toggle.
- Workout summary duration handling was fixed.
- Profile and onboarding were expanded with more user preferences.
- Profile input sanitization and AI rate limiting were added.
- Recovery silhouettes, cardio cycling icons, and backup tooling were added.

## In Progress

- Terminology is being normalized across the app so the same concepts use the same labels everywhere.
- Current wording changes standardize labels such as `Total Volume`, `Weekly Volume Goal`, `Duration`, and `View Insights`.
- This polish pass currently touches:
  - `src/pages/BodyMetrics.jsx`
  - `src/pages/CalendarLog.jsx`
  - `src/pages/Dashboard.jsx`
  - `src/pages/Profile.jsx`
  - `src/pages/Routines.jsx`
  - `src/pages/WorkoutPage.jsx`

## Why This Matters

- The Progress experience is now much closer to a product surface than a raw training log.
- The recent UI pass improves comprehension by prioritizing summaries, trends, and replayable history.
- The current terminology cleanup reduces friction caused by mixed labels like `Volume`, `lbs lifted`, and `time logged` referring to similar ideas in different places.

## Next Slice

- Finish the copy normalization pass and verify the labels are consistent across dashboard, progress, workout summary, profile goals, and AI insight entry points.
- Run a quick UI regression pass on mobile and desktop for the updated Progress flows.
- If the polish holds up, bundle the wording cleanup into the next commit as a final consistency pass for this sprint.
