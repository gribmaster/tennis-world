// JournalHero — the editorial page hero for /journal, ported from the hero band in
// files/journal.html: a light ivory panel with a bottom hairline, an eyebrow, and a
// serif display title.
//
// PRESENTATIONAL only. The copy is page chrome (local constants, overridable via
// props) — NOT article data — so this component imports no repository and no
// @tennis/mock-data.

const DEFAULT_EYEBROW = 'Journal';
const DEFAULT_TITLE = 'Reading, writing, and the world of tennis travel.';

export interface JournalHeroProps {
  eyebrow?: string;
  title?: string;
}

export function JournalHero({
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
}: JournalHeroProps) {
  return (
    <section className="border-b border-hairline bg-ivory">
      <div className="container-page py-[clamp(40px,6vw,80px)]">
        <p className="eyebrow text-stone">{eyebrow}</p>
        <h1 className="display-l mt-3 max-w-[480px] text-ink">{title}</h1>
      </div>
    </section>
  );
}
