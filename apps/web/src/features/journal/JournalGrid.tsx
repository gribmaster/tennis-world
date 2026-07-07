import type { ArticleDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { ArticleCard } from './ArticleCard';

// JournalGrid — the body of the Journal page, ported from files/journal.html: a
// featured lead article (the newest), then a responsive grid of the remaining
// articles (`repeat(auto-fill, minmax(280px, 1fr))`, gap 40).
//
// PRESENTATIONAL & data-driven: it renders the `articles` it is handed (already
// sorted newest-first by the repository) and never fetches. Mobile-first — the
// featured card stacks and the grid collapses to a single column.

export interface JournalGridProps {
  articles: ArticleDTO[];
}

export function JournalGrid({ articles }: JournalGridProps) {
  // Destructured up front so TS narrows `lead` to a defined value after the guard
  // (works cleanly under noUncheckedIndexedAccess, no non-null assertion needed).
  const [lead, ...rest] = articles;

  if (!lead) {
    return (
      <section className="bg-bone py-section-lg md:py-section-xl">
        <PageContainer>
          <p className="body-m text-stone">No articles to read yet.</p>
        </PageContainer>
      </section>
    );
  }

  return (
    <section className="bg-bone py-section-lg md:py-section-xl">
      <PageContainer>
        {/* Featured lead article. */}
        <ArticleCard article={lead} variant="featured" priority />

        {/* The rest of the list. */}
        {rest.length > 0 ? (
          <ul className="mt-section-lg grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article) => (
              <li key={article.id}>
                <ArticleCard article={article} />
              </li>
            ))}
          </ul>
        ) : null}
      </PageContainer>
    </section>
  );
}
