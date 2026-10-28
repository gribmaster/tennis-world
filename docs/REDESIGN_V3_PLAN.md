# Redesign v3 — plan and decisions

Source of truth for every v3 task (`docs/TASK_55` onward). Read this first, then the task.

## Reference files

All in `new design/redesign v3/`:

- `tennis_world_v17_standalone.html` — **mobile** prototype (React-in-HTML, open in a browser).
- `tennis_world_desktop_standalone4.html` — **desktop** prototype.
- `tennis_world_design_decisions.md` — why the design looks the way it does.
- `tennis_world_frontend_spec.md` — tokens, component inventory, screen map.

The HTML files are reference, not code to paste: port the values (sizes, colors, copy, spacing)
into this app's existing Tailwind tokens and components. Where the spec `.md` and the HTML
disagree, **the HTML wins** (e.g. the spec says the mobile nav is bottom-docked; the v17 file
actually puts it at the top — follow the file).

Both prototypes contain demo-only scaffolding that must **not** be ported:

- the screen-tab buttons and the Guest / Free / Full switcher above the device frame;
- the fake browser/phone chrome (`StatusBar`, `.browser-topbar`, URL pill);
- the scripted "payment always fails first, then Try again succeeds" flow
  (`handlePaywall` → `paywall-fail`). Real checkout stays exactly as it works today.

## Tokens

Colors (ink, graphite, stone, mist, bone, ivory, paper, clay, moss, gold) and the two fonts
(Cormorant Garamond + Inter) already match `tailwind.config.ts` / `app/layout.tsx`. v3 is a
layout and structure change, not a new design system. Add a token only when a v3 value is
genuinely new (e.g. the floating-nav shadow), and add it once, centrally.

## Product decisions (made by the owner, do not re-litigate)

1. **Home ("Atlas") becomes exactly the v3 Home**: hero court carousel + membership section.
   The current Home sections (search bar, category shortcuts, map-preview band, Featured
   courts, Editor's Cut, collections teaser, journal teaser, paywall band) are removed from
   Home. Search and filters live on the Courts screen.
2. **Pricing copy stays on our real model.** v3 says "One-time payment · Lifetime · $29 · No
   subscription". We sell a recurring subscription (monthly / quarterly / yearly). Use v3's
   layout, but every price / plan sentence must describe our real subscription. No billing,
   Stripe, or plan changes in any v3 task.
3. **Guests don't see the map.** On the Courts screen a signed-out visitor gets the v3
   "Sign in to view the map" treatment (locked map placeholder + sign-in prompt); the court
   list stays visible. Signed-in free users see the map, with premium courts still masked.
4. **Journal leaves the navigation, its pages stay.** `/journal` and articles keep working and
   remain linked from the Footer. The Footer itself stays for now.

## Naming / routing

| v3 nav label | Route in this app |
|---|---|
| Atlas | `/` |
| Courts | `/map` (route stays `/map` for now; only the label changes) |
| Collections | `/collections` |
| Profile | `/profile` (signed in) · `/signin` (guest) |

Saved (`/saved`) is not in the nav in v3. It is reached from Profile and lights up the
Profile tab.

## Access-state mapping

v3's single `accessState` maps onto what we already compute server-side:

| v3 | This app |
|---|---|
| `guest` | `signedIn === false` |
| `free` | `signedIn && !viewerIsEntitled` |
| `full` | `viewerIsEntitled` |

## Task sequence

1. TASK_55 — Floating pill navigation; remove the bottom tab bar. (done)
2. TASK_56 — The one shared `CourtCard` (v3 markup, bookmark save button). (done)
3. TASK_57 — Courts screen (`/map`): title + list grid + map panel, guest map gate. (done)
4. TASK_58 — Home / Atlas. (done)
5. TASK_59 — Court Detail. (done)
6. TASK_60 — Collections + Collection Detail. (done)
7. TASK_61 — Profile, Saved, Settings. (done)
8. TASK_62 — Sign-in and payment result screens. (done — the last v3 task)

Each task is self-contained and ends in a working app. No git commit or push unless asked.
