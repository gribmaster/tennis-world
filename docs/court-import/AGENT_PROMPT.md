# Tennis Map — court import agent prompt (PDF → JSON)

Give your agent **this whole document**, `court-import.schema.json`, and the
**court PDF** ("The Tennis Map — Court Cards", one page per court, with the
index page first). `example.json` is a finished example of the output for the
five courts of the reference PDF.

---

## Your task

The PDF already contains everything about each court. **You are not
researching anything — you are transcribing.** Turn every court page of the PDF
into one entry of a single JSON document that is valid against
`court-import.schema.json`.

**Work only from the PDF.** Do not browse the web, do not add facts from your
own knowledge, do not rewrite or "improve" the text. The only knowledge you may
use is reference data that is not in the PDF: the country's ISO code and
continent.

**Your output is that one JSON document, inside a single ```json code
block** (so the reviewer can copy it in one click). Nothing but the JSON goes
inside the block, and no introduction or commentary comes before it. If you
had to leave a court out (see "When to leave a court out"), add a short
plain-text note **after** the code block — outside it — headed exactly
`COULD NOT VERIFY:`, listing each court you left out and why.

A human reviews every court before anything is published, and the import
system checks shapes, enums and ranges — but it cannot check that you copied
the right value. That is your job.

## What is on a court page, and where each value goes

A court page has: a heading (court name, ALL CAPS), a location line
(`CITY, COUNTRY`), a coordinates line, a row of small pill labels, a table
called **THE ESSENTIALS**, one to three paragraphs of description, photos, and
an **OPEN IN GOOGLE MAPS →** button. Depending on how you read the PDF, the
small grey labels may come out letter-spaced (`A C C E S S`) — read them as the
normal words.

| JSON field | Take it from the PDF | Rules |
|---|---|---|
| `name` | The court's entry in the **"IN THIS FILE" index on page 1** | The page heading is ALL CAPS and split over several lines; use the index spelling (proper case, accents kept), e.g. `Monte-Carlo Country Club`, `Hotel Cap-Estel`. |
| `country` | The country after the last comma of the location line | `{ "name": "France", "isoCode": "FR", "continent": "Europe" }`. English common name; `isoCode` is the ISO 3166-1 alpha-2 code; `continent` is one of `Europe`, `Asia`, `Americas`, `Africa`, `Oceania`. |
| `region` | The city/area before the last comma of the location line | Proper case, accents kept, as spelled in the index (`Èze-sur-Mer`, `Saint-Jean-Cap-Ferrat`). |
| `lat`, `lng` | The coordinates line, e.g. `43.7516° N / 7.4407° E` | Decimal degrees as numbers, **exactly the printed digits** (do not round, pad or extend). `N` and `E` are positive; **`S` and `W` are negative**. First number is latitude. |
| `mapLinkUrl` | The link behind the **OPEN IN GOOGLE MAPS →** button | Copy the URL exactly (it looks like `https://maps.google.com/?cid=…`). **If you cannot read link targets, leave `mapLinkUrl` out and say so in `notes`. Never build a link yourself and never guess a `cid`.** |
| `surface` | `SURFACE` row of THE ESSENTIALS | One of `Clay`, `Hard`, `Grass`. If several are listed (`Clay · Hard`) use the **first** one and say so in `notes`. `Artificial grass` → `Grass` (say so in `notes`). |
| `access` | `ACCESS` row, cross-checked with the pill labels | See "Access" below. One of `Resort`, `Club`, `Academy`, `Private`. |
| `indoorOutdoor` | Not printed in the PDF | `Indoor` only if the page text clearly says indoor/covered. Otherwise `Outdoor`, **and say "indoor/outdoor not stated: assumed Outdoor" in `notes`**. |
| `setting` | The description text | A SHORT factual phrase (max 120 characters, no `<` or `>`) taken from what the description says about where the courts are, e.g. `Terraced clay courts stepping down towards the sea`. Not a full sentence, not marketing copy, nothing the PDF does not say. |
| `isScenic` | The pill labels | `true` if a pill label contains view / sea / lake / mountain / hills / coast / beach / garden / park; otherwise leave the field out. |
| `tags` | The pill labels | See "Tags" below. Omit the field if nothing maps. |
| `blurb` | The description paragraphs | **Copy verbatim** — same words, same punctuation, same accents, same order. See "Blurb" below. |
| `sources` | `WEBSITE` row + the Google Maps link | 1–10 `https://` URLs: the website first (the URL behind the `WEBSITE` text if you can read it, otherwise `https://` + the printed domain, e.g. `https://mccc.mc`), then the Google Maps link if you have it. Not stored — only for the reviewer. |
| `notes` | — | Optional, **max 500 characters**, for the reviewer: every assumption and every contradiction you noticed (see "Notes"). Not stored. |

The **ESSENTIALS rows `BOOKING`, `EVENT`, `COURTS`, `BEST TIME`, `WEBSITE`
and `COURT HIRE`** have no field in the schema — **do not import them, do not
put them into the blurb or the setting.** (`WEBSITE` goes to `sources`.)

## Access

Decide from the `ACCESS` row; use the pill labels only to cross-check.

| The PDF says… | `access` |
|---|---|
| `Hotel guests`, `Hotel guests & court hire`, or the court belongs to a hotel/resort (pill `luxury hotel`, `boutique hotel`) | `Resort` — a hotel or resort property; the court is an amenity for guests |
| `Public`, `Public · court hire`, a club whose courts can be hired, a members' club not described as exclusive | `Club` — an ordinary tennis or country club |
| An academy / training centre (pill `tennis academy`) | `Academy` |
| Explicitly **members only / invitation only / private club** in the ACCESS row | `Private` — an explicitly private club |

If the `ACCESS` row and a pill label disagree (e.g. `Public · court hire` vs
the pill `private club`), **follow the ACCESS row** and mention the
disagreement in `notes`.

## Tags

The pill labels under the coordinates are the only source for tags. Map each
pill with this closed vocabulary; a pill that matches nothing gives no tag, and
**surface, access and indoor/outdoor are never tags** (`clay court`,
`hard court`, `luxury hotel`, `private club` → no tag). Never invent a tag from
the description.

| Tag | Pill label examples |
|---|---|
| `Sea View` | `sea view`, `riviera`, `coastal`, `oceanfront`, `waterfront` |
| `Beach Club` | `pampelonne beach`, any beach-club pill |
| `Mountains` | `alpine view`, `mountain resort`, `saint-tropez hills`, `hilltop` |
| `Lakeside` | `lakeside`, `lakefront`, `lake estate` |
| `Garden` | `garden court` |
| `Historic` | `heritage club`, `art deco`, `historic park`, `manor`, `centuries-old` |
| `Jungle` | `jungle`, `rainforest`, `tropical garden` |
| `Island` | `island` |
| `Rooftop` | `rooftop court`, `roof terrace` |
| `Countryside` | `countryside estate`, `vineyard estate`, `château` |

Use each tag at most once.

## Blurb

- The description paragraphs under THE ESSENTIALS become `blurb`, **verbatim**.
  Join the lines of one paragraph with single spaces (a line break inside a
  paragraph is only page wrapping) and separate paragraphs with **one blank
  line** (`\n\n` inside the JSON string).
- Paragraphs are visible as separate blocks with a small gap between them. Text
  extraction often does not show the gaps. **If you can see the page image, use
  it. If you cannot tell where a paragraph ends, keep the whole description as
  one paragraph — never guess.**
- 1 to 6 paragraphs. Do not translate, shorten, reorder, fix or add anything.
  Keep typographic apostrophes and quotes as printed. The text must not contain
  `<` or `>`.

## Notes

Put in `notes` (max 500 characters, short sentences), in this order of
importance:
1. **Contradictions inside the PDF** that you noticed, e.g. `COURTS says 23 but
   the text says 21 courts`, or an ACCESS row that disagrees with a pill label.
   Keep the PDF's text as is; just report it.
2. Every value you had to **choose or convert** (first of several surfaces,
   `Artificial grass` → `Grass`, a link you could not read).
3. `indoor/outdoor not stated: assumed Outdoor` (required whenever you used the
   default).

## When to leave a court out

Leave a court out of the JSON, and list it under `COULD NOT VERIFY:` with a
one-line reason, **only** if a required value is missing or unreadable in the
PDF: the name, the location line, the coordinates, the surface, or the
description. Never fill such a gap with a guess, a city-centre coordinate or
something from your own knowledge. A missing Google Maps link is **not** a
reason to leave a court out — just omit `mapLinkUrl` and note it.

## What NOT to include

- **No photos** — the PDF's photos are not imported; an admin adds photos by
  hand afterwards.
- **No `status`** — every imported court is a draft.
- **No `slug`** — it is generated from `name`.
- **No `isLocked` / `isFeatured`** — they default to premium (`isLocked: true`)
  and not featured, which is this project's normal default for imported courts.
- **No field that `court-import.schema.json` does not define** — an unknown
  field makes the whole import fail.

## Output language

English, for every field you write. (`blurb` is copied as printed in the PDF.)

## Final self-check before you answer

For each court, check: the coordinates have the printed digits and the right
signs; `country.isoCode` is two letters; `surface`, `access`, `indoorOutdoor`
and every tag are exactly one of the allowed values; `blurb` is an exact copy;
`notes` is at most 500 characters; every URL starts with `https://`; the JSON
parses.
