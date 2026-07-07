import type { ArticleDTO } from '@tennis/contracts';

// ArticleBody — the readable article body for /journal/[slug], rendered from
// `article.bodyRichText`.
//
// PRESENTATIONAL & data-driven (Phase 1 §4): receives the article via props, calls
// no repository, imports no @tennis/mock-data.
//
// `bodyRichText` is deliberately a single string in the contract (@tennis/contracts
// ArticleSchema). Phase-1 mock data is PLAIN TEXT, but the field name and the
// eventual CMS (Architecture Plan §6 — Refine rich-text editor) anticipate HTML, so
// this component handles both shapes without pulling in a markdown/rich-text library:
//
//   • Plain text  → split into paragraphs on blank lines (falling back to single
//     newlines) and rendered as styled <p> elements. This is the Phase-1 path.
//   • HTML        → rendered via dangerouslySetInnerHTML.
//
// SECURITY NOTE: when bodyRichText is HTML it is injected as-is. SANITIZATION IS NOT
// THIS COMPONENT'S JOB — it belongs to the backend/admin (CMS) phase: the API/admin
// must sanitize rich text on write (Architecture Plan §6, Phase 3) so that by the
// time it reaches the web app it is already trusted. There is no untrusted/user-
// authored HTML in Phase 1 (mock data is authored in-repo), so this is safe here; the
// hook simply must not be relied upon as a sanitization boundary.
//
// DROP-CAP (Feature 31): when `dropCap` is set, the first letter of the first
// paragraph is floated as a large serif initial (matching files/article.html). This
// is applied ONLY on the trusted plain-text path — splitting the first rendered
// paragraph's leading character is safe for in-repo plain text but would require
// parsing/mutating arbitrary HTML on the dangerouslySetInnerHTML branch, which this
// presentational component will not do. So the HTML fallback renders WITHOUT a
// drop-cap (it degrades to a normal first paragraph); the drop-cap is a Phase-1
// plain-text-mock affordance only.

/** Heuristic: does this string look like HTML (contains a tag), vs. plain text? */
function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Split plain text into paragraphs: blank-line separated, else single newlines. */
function toParagraphs(value: string): string[] {
  const byBlankLine = value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  return value
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export interface ArticleBodyProps {
  article: ArticleDTO;
  className?: string;
  /**
   * Float the first letter of the first paragraph as a large serif drop-cap
   * (files/article.html). Applies ONLY on the plain-text path — see the DROP-CAP note
   * above; the HTML fallback ignores it and renders a normal first paragraph.
   */
  dropCap?: boolean;
}

export function ArticleBody({ article, className, dropCap = false }: ArticleBodyProps) {
  const { bodyRichText } = article;
  const wrapperClass = ['body-l text-graphite', className ?? ''].filter(Boolean).join(' ');

  if (looksLikeHtml(bodyRichText)) {
    // HTML rich text. See SECURITY NOTE above — sanitization is a backend/admin
    // (CMS) responsibility, not this presentational component's. The drop-cap is
    // intentionally NOT applied here (DROP-CAP note above) — it stays a plain-text
    // affordance, so the HTML branch renders the first paragraph normally.
    return (
      <div
        className={['article-richtext', wrapperClass].join(' ')}
        // eslint-disable-next-line react/no-danger -- CMS sanitization is upstream (backend/admin phase); Phase-1 content is in-repo and trusted.
        dangerouslySetInnerHTML={{ __html: bodyRichText }}
      />
    );
  }

  // Plain text (the Phase-1 path): render as graceful paragraphs.
  const paragraphs = toParagraphs(bodyRichText);

  return (
    <div className={wrapperClass}>
      {paragraphs.map((paragraph, i) => {
        const isFirst = i === 0;
        // Apply the drop-cap to the first paragraph only, and only when it has a
        // leading character to float.
        if (dropCap && isFirst && paragraph.length > 0) {
          return (
            <p key={i}>
              <span className="serif float-left mr-2.5 mt-1.5 text-[56px] font-normal leading-none text-ink">
                {paragraph[0]}
              </span>
              {paragraph.slice(1)}
            </p>
          );
        }
        return (
          <p key={i} className={isFirst ? undefined : 'mt-6'}>
            {paragraph}
          </p>
        );
      })}
    </div>
  );
}
