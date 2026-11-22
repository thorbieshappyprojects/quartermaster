import type { CompiledSystem } from '../model/types.ts';
import { silhouetteUrl } from '../data/deck.ts';

export function Silhouette({ card, label }: { card: Pick<CompiledSystem, 'silhouette' | 'category'>; label?: string }) {
  const url = silhouetteUrl(card);
  return (
    <div class="sil-window">
      <div
        class={`sil${card.silhouette ? '' : ' placeholder'}`}
        style={{ '--src': `url("${url}")` }}
        role="img"
        aria-label={label ?? (card.silhouette ? 'Silhouette' : 'Generic category silhouette')}
      />
    </div>
  );
}
