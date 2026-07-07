import { PageContainer } from '@/components/layout';
import type { LegalContent } from './legal-content';

// LegalPage — the reusable presentational shell for the Privacy and Terms pages,
// ported from the sectioned `StaticPage` in files/privacy.html / files/terms.html.
// Both legal pages share the same layout; only the `content` differs (supplied from
// `legal-content.ts`).
//
// Layout (matching the prototype):
//   • a bone (`ivory`) header band with a hairline bottom border, holding the
//     eyebrow, serif title, and "Last updated" string;
//   • a body section: the intro/disclaimer paragraph, then the section list
//     (serif heading + body paragraphs each).
//
// PRESENTATIONAL only. It owns layout/typography; the copy is page chrome passed in
// via `content`. It does NOT fetch, hold state, or import `@tennis/mock-data`.
//
// ⚠️ The copy it renders is PLACEHOLDER legal text (see legal-content.ts header) —
// the intro paragraph itself carries the "replace with counsel-reviewed language
// before launch" disclaimer.

export interface LegalPageProps {
  content: LegalContent;
}

export function LegalPage({ content }: LegalPageProps) {
  const { eyebrow, title, lastUpdated, intro, sections } = content;

  return (
    <>
      {/* Header band — ivory panel with hairline divider, ported from the prototype. */}
      <div className="border-b border-hairline bg-ivory px-[clamp(24px,6vw,80px)] py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto max-w-[760px]">
          <p className="eyebrow text-stone">{eyebrow}</p>
          <h1 className="display-l mt-3 text-ink">{title}</h1>
          <p className="body-m mt-3 text-stone">{lastUpdated}</p>
        </div>
      </div>

      {/* Body — intro/disclaimer then the section list. */}
      <PageContainer as="section" className="py-[clamp(48px,6vw,96px)]">
        <div className="mx-auto max-w-[760px]">
          <p className="body-l mb-8 text-graphite">{intro}</p>

          {sections.map((section) => (
            <div key={section.h} className="mb-9">
              <h2 className="headline mb-3 text-ink">{section.h}</h2>
              {section.p.map((para, j) => (
                <p key={j} className="body-m mb-2.5 leading-[1.75] text-graphite">
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
