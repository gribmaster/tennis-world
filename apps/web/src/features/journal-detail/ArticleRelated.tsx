import type { ArticleDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { ArticleCard } from '@/features/journal';

// ArticleRelated — the "More from the Journal" band from files/article.html's
// ArticlePage: an ivory section with a "Continue Reading" eyebrow + serif title and a
// responsive grid of up to three related articles.
//
// PRESENTATIONAL & data-driven (Phase 1 §4):
//   • Receives the already-computed `articles` via props — the page selects them
//     (list() → exclude current slug → take 3); this component never fetches and
//     never imports @tennis/mock-data.
//   • Reuses the journal feature's <ArticleCard> (default variant) so related cards
//     read identically to the /journal grid and link to /journal/{slug}.
//   • Renders nothing when there are no related articles, and lays out gracefully for
//     1–3 cards (the current article is already excluded upstream).

export interface ArticleRelatedProps {
  /** Related articles, already filtered to exclude the current one and capped (≤3). */
  articles: ArticleDTO[];
}

export function ArticleRelated({ articles }: ArticleRelatedProps) {
  if (articles.length === 0) return null;

  return (
    <section className="border-t border-hairline bg-ivory py-section-lg md:py-section-xl">
      <PageContainer>
        <div className="mb-8">
          <p className="eyebrow text-stone">Continue Reading</p>
          <h2 className="display-m mt-2 text-ink">More from the Journal</h2>
        </div>

        <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <li key={article.id}>
              <ArticleCard article={article} />
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
