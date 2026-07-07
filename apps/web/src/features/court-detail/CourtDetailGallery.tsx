import type { CourtImageDTO } from '@tennis/contracts';
import { CourtImage } from '@/components/court';

// CourtDetailGallery — the lead image + thumbnail strip for the Court Detail page,
// ported from the gallery in the prototype's inline `CourtDetail` (map.html/home.html).
//
// PRESENTATIONAL & data-driven (Phase 1 §4): receives the court's images + name via
// props, renders from them only. No repository, no @tennis/mock-data, no fetching.
//
// PHASE-1 SIMPLIFICATION (Feature 11 §3.2 / Feature 12 task 5): this is a STATIC
// gallery — a large lead image with a non-interactive thumbnail row beneath. There is
// deliberately no image-switching state, so this stays a server component and the
// whole page stays server-rendered. Interactive switching can be added later in a
// single small 'use client' component without touching the page.

export interface CourtDetailGalleryProps {
  /** The court's gallery images (CourtDTO.images). May be empty. */
  images: CourtImageDTO[];
  /** Fallback single image if `images` is empty (CourtDTO.heroImageUrl). */
  heroImageUrl: string;
  /** Court name, used for the lead image alt text. */
  courtName: string;
}

export function CourtDetailGallery({ images, heroImageUrl, courtName }: CourtDetailGalleryProps) {
  // Lead = the hero image if flagged, else the first image, else the heroImageUrl.
  const lead = images.find((img) => img.isHero) ?? images[0];
  const leadUrl = lead?.url ?? heroImageUrl;
  const leadAlt = lead?.alt?.trim() || courtName;

  // Thumbnails are decorative duplicates of the gallery here (static, no switching),
  // so they carry empty alt text. Only show the strip when there's more than one.
  const thumbnails = images.length > 1 ? images : [];

  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden bg-ivory">
        <CourtImage
          src={leadUrl}
          alt={leadAlt}
          aspectClassName="aspect-[16/10]"
          withOverlay={false}
          priority
          sizes="(max-width: 1024px) 100vw, 66vw"
        />
      </div>

      {thumbnails.length > 0 ? (
        <ul className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
          {thumbnails.map((img, i) => (
            <li key={`${img.url}-${i}`} className="shrink-0">
              <CourtImage
                src={img.url}
                alt=""
                aspectClassName="h-12 w-[72px]"
                withOverlay={false}
                sizes="72px"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
