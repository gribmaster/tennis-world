# Tennis Map — court import agent prompt

Paste this whole document (or point your agent at this file) together with
`court-import.schema.json` and your list of court names.

---

## Your task

You will be given a list of tennis court / venue names. For each one, research
it on the web and produce **one JSON document** describing it, valid against
the attached JSON Schema (`court-import.schema.json`).

**Your output is that one JSON document, inside a single ```json code
block** (so the reviewer can copy it in one click). Nothing but the JSON goes
inside the block, and no introduction or commentary comes before it. If you
could not verify one or more courts well enough to include them (see "Research,
don't guess" below), add a short plain-text note **after** the code block —
outside it — listing which courts you left out and why, headed exactly
`COULD NOT VERIFY:`.

A human will review every field before anything is imported, and the import
system itself double-checks shapes, enums, and ranges — but it cannot check
whether a fact is TRUE. That is your job.

## Research, don't guess

For every court, search the web for:
- the venue's own official website (if it has one),
- its Google Maps listing,
- its OpenStreetMap entry,
- any reputable third-party page that describes it (hotel booking sites,
  tennis/travel press, the relevant national or regional tennis federation).

Use these to fill in every field. **Never invent a fact you could not verify.**
If you cannot verify a court's coordinates from an official page, Google Maps,
or OpenStreetMap, **leave that court out of the JSON entirely** and list it in
the `COULD NOT VERIFY:` note instead, with a one-line reason. Do not guess at
a plausible-sounding location, surface, or history. An approximate-but-wrong
fact is worse than an honest gap — the human reviewer cannot easily catch a
confident wrong answer, but can easily fill in a gap you flagged.

## Coordinates (`lat` / `lng`)

In this order of preference:
1. If you found the venue's own Google Maps link, use the pin's exact
   coordinates from that link (not a geocoded address).
2. Otherwise, use the venue's own pin on Google Maps or OpenStreetMap — the
   actual building/court location, not a street address lookup.
3. **Never use the city or town centre as a stand-in.** If you cannot find the
   venue's own pin, that court belongs in `COULD NOT VERIFY:`, not in the JSON
   with a city-centre guess.

Give coordinates to **at most 7 decimal places** (more implies false
precision the source doesn't actually have). If you are not fully confident
in the pin, still include the court but say so explicitly in its `notes`
field (e.g. `"notes": "coordinates approximate — venue has no exact pin"`).

If you found a usable Google Maps link for the venue, put it in `mapLinkUrl`
too (it becomes the "Directions" link a member sees) — it must be the real
link for this specific venue, not a generic search URL.

## The enums, explained

**`surface`** — the court's actual playing surface. Only `Clay`, `Hard`, or
`Grass`. If a venue has multiple surfaces, pick the one most associated with
its main/signature court (prefer what the venue itself calls its main court).
Don't guess from the venue's general style (e.g. a Mediterranean resort is not
automatically clay) — confirm it from a source.

**`access`** — who can actually play there:
- `Resort` — a hotel or resort property; the court is an amenity for guests
  (e.g. "the hotel's tennis court", a resort spa/sports club).
- `Club` — an ordinary members' tennis club or country club, not advertised
  as exclusive/invitation-only.
- `Academy` — a tennis academy or training centre (coaching-focused, usually
  literally named "... Tennis Academy").
- `Private` — an explicitly **private** club: invitation- or membership-only,
  commonly described as a "private club".

**`indoorOutdoor`** — `Indoor` only if the court is genuinely covered/indoors.
If you cannot confirm it either way, use `Outdoor` — it is the far more common
case among the venues this project lists — **and say so in that court's
`notes`** (e.g. `"indoor/outdoor not confirmed — assumed Outdoor"`), so the
reviewer knows it is an assumption and not a verified fact.

## Tags (optional — use only what clearly applies)

A **closed** vocabulary; omit the field entirely if nothing clearly applies,
and never use a tag to restate `surface`/`access`/`indoorOutdoor`/`isScenic`
(those already have their own fields):

| Tag | Use when the court/venue is… |
|---|---|
| `Sea View` | by the sea/ocean, or on a well-known coastline (e.g. the Riviera) |
| `Beach Club` | on or directly attached to a beach club |
| `Mountains` | in a mountain, alpine, or hill setting |
| `Lakeside` | on or next to a lake |
| `Garden` | set within a notable garden |
| `Historic` | in a historic building or heritage site (e.g. a centuries-old estate) |
| `Jungle` | in a jungle, rainforest, or tropical-garden setting |
| `Island` | on an island |
| `Rooftop` | a rooftop court |
| `Countryside` | a rural/countryside estate (vineyard, château, manor, farmland) |

## Writing `blurb`

1 to 6 paragraphs, each separated by **one blank line**. Style: evocative but
factual — no marketing superlatives ("world-class", "unparalleled",
"once-in-a-lifetime"), no invented history, English only. Two real,
already-approved examples (see `example.json` for the full JSON they sit in):

> Domaine des Etangs is a 13th-century château set inside a vast private
> estate in the French countryside, surrounded by forests, pastures, ponds,
> and contemporary art. It feels less like a hotel and more like a quiet
> world built around nature and time.
>
> Its tennis court is the detail that makes the place unforgettable: a
> floating court set on the water. Instead of a classic country-club
> setting, tennis here feels almost surreal — red clay, still ponds, old
> stone, and the silence of a château estate. A location where sport becomes
> part of the landscape, not separate from it.

> Monte-Carlo Country Club opened in 1928 on the edge of Monaco, though
> technically it sits just across the border in Roquebrune-Cap-Martin,
> France. That small geographical twist is part of its charm: it belongs to
> the Monaco myth, but its clay courts are carved into the French Riviera
> hillside above the Mediterranean.
>
> The club became the permanent home of the Monte-Carlo tournament, now the
> Rolex Monte-Carlo Masters, one of the most elegant stops of the clay
> season. Its terraced courts, sea views and old Riviera atmosphere make
> tennis here feel less like a simple sport and more like a ritual of
> spring: red clay, white lines, cypress trees, and the Mediterranean just
> beyond the baseline.

Match that register: specific, sensory, grounded in verifiable facts — not a
hotel brochure.

## `sources`

List 1–10 `https://` URLs you actually used, **official site first** when the
venue has one, then Google Maps/OpenStreetMap/press. These are not stored on
the court — they exist purely so the human reviewer can check your work.

## What NOT to include

- **No photos of any kind** — there is no field for them. The admin adds
  photos by hand afterwards.
- **No `status`** — every imported court is a draft; you never decide
  publication.
- **No `slug`**, unless you were explicitly told one to use — it is generated
  automatically from `name`.
- **No `isLocked` / `isFeatured`** — leave both out unless explicitly told
  otherwise. They default to premium (`isLocked: true`) and
  not-featured (`isFeatured: false`), which matches this project's normal
  default for every imported court.
- No field beyond what `court-import.schema.json` defines — an unknown field
  is rejected, not ignored.

## Output language

English, for every field, regardless of what language your sources are in.
