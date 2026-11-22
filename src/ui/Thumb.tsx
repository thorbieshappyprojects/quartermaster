import type { CompiledSystem } from '../model/types.ts';
import { Silhouette } from './Silhouette.tsx';

/** Commons thumbnails can be requested at another width by rewriting the "/<n>px-" segment. */
export function thumbUrl(url: string, width = 500): string {
  // 500 is one of Commons' standard thumbnail sizes (cached, no on-demand rendering).
  return url.replace(/\/\d+px-([^/?]+)(\?.*)?$/, `/${width}px-$1$2`);
}

/** Small picture for tiles and lists: first openly licensed photo, else the silhouette or placeholder.
 *  Full attribution is on the card itself; the tooltip names author and licence. */
export function Thumb({ card, label }: { card: Pick<CompiledSystem, 'silhouette' | 'category' | 'photos'>; label?: string }) {
  const p = card.photos?.[0];
  if (!p) return <Silhouette card={card} label={label} />;
  return (
    <div class="thumb">
      <img src={thumbUrl(p.image_url)} alt={label ?? p.caption} title={`Photo: ${p.author || 'unknown'}, ${p.licence} (Wikimedia Commons)`} loading="lazy" decoding="async" referrerpolicy="no-referrer" />
    </div>
  );
}
