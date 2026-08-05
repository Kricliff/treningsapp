# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary and currently only user: Kristian Clifford (47), following a fixed 4-day
SATS strength program (Dag 1 Overkropp, Dag 2 Ben, Dag 3 Overkropp, Dag 4 Ben +
intervall), training 3–4x/week, also logging cardio and bodyweight. Built open
to eventually being used by other people (friends, other SATS members) but not
actively shared or multi-tenant today — no account system beyond his own
optional Google sign-in for cloud backup.

## Product Purpose

A personal training, cardio, bodyweight, and nutrition log built specifically
around Kristian's own SATS program and calorie/macro targets. Exists to
replace error-prone spreadsheets/memory with a fast, low-friction logger that
protects against data loss (cloud backup) and removes the friction of manual
calorie math (built-in calculator, food database, and a randomized
"Handleliste" shopping-list generator). Success is consistent logging without
abandoning the habit, accurate week-over-week progress visibility, and never
losing historical data again.

## Positioning

Unlike general-purpose fitness apps (Strong, Hevy, MyFitnessPal), this is
hand-built around one specific program's exact exercises/sets/reps, one
person's exact calorie/macro targets, and direct Strava upload of a workout
summary — no generic program library, no social feed, no subscription, no
ads. It is small and disposable-feeling as engineering (a single
dependency-free `index.html`) but is being treated with the same design care
as a shipped consumer product, because "open to being shared later" means
today's shortcuts become tomorrow's rework.

## Operating Context

- Used mid-workout at the gym: phone in hand, often one-handed, between sets —
  logging must be fast, thumb-reachable, and resilient to being closed and
  reopened mid-session.
- Used at home throughout the day for kondisjon/kroppsvekt logging and
  kosthold/kalorikalkulator entries.
- Runs as an iOS home-screen PWA and in mobile browser tabs; no native app
  store presence.
- Data recovery matters: a past sync bug caused real data loss, so any future
  data-handling change must default to additive/non-destructive behavior,
  never a silent overwrite.

## Capabilities and Constraints

- Zero build step: the entire app is one dependency-free `index.html` plus a
  tiny `serve.js` for local dev. No framework, no bundler.
- Client-side only: localStorage is the source of truth. Firebase (Firestore
  + Google Auth) provides optional merge-based cloud backup — pull/push is
  additive by design, never a destructive overwrite.
- Strava integration via a separate Cloudflare Worker (`strava-worker/`) that
  owns the OAuth secret; the app sends only a text summary per session, not
  the full log.
- Fixed 4-day SATS program with per-exercise sets/reps/cues/video baked into
  the code; not user-editable per exercise (only skippable per session).
- Kosthold tab has an editable daily calorie/macro target, a ~60-item food
  database, manual food entry, and a randomized shopping-list generator
  constrained to the day's remaining calorie budget.
- Open/undecided: no defined path yet for a second user — no multi-account
  model, no per-user program customization. Revisit when sharing becomes
  real rather than inventing it now.

## Brand Commitments

None formalized yet. The UI currently just says "Treningslogg." No logo and
no defined palette beyond the current dark-theme implementation. This is an
open decision for future design work, not something to invent here.

## Evidence on Hand

None. No testimonials, screenshots, or external references exist yet — this
is a single, currently unpublished personal tool.

## Product Principles

1. Logging friction beats any feature — if it slows down mid-workout entry,
   cut it.
2. Never lose Kristian's data — sync and any future data operation must be
   additive/reversible, never a silent overwrite.
3. Built for one real program and one real person's numbers, not a
   configurable general-purpose tool — precision over flexibility, for now.
4. No dependencies, no build step, no required accounts beyond optional
   backup — stays inspectable and portable.
5. Designed with the same care as a shipped product even with an audience of
   one, because it may not stay that way.

## Accessibility & Inclusion

No specific requirement established; single sighted adult user on a modern
iPhone today. Revisit if/when opened to other users.
