import { useState } from 'preact/hooks';
import type { Photo } from '../model/types.ts';

/** A photo with its required attribution (author, licence, link to the file page). */
export function PhotoView({ photos, hideCaption }: { photos: Photo[]; hideCaption?: boolean }) {
  const [i, setI] = useState(0);
  const p = photos[i % photos.length];
  return (
    <figure class="photo">
      <div class="photo-frame">
        <img src={p.image_url} alt={hideCaption ? 'Photo of the mystery system' : p.caption} loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        {photos.length > 1 && (
          <button class="photo-next" aria-label="Next photo" onClick={() => setI(i + 1)}>
            {(i % photos.length) + 1}/{photos.length} ›
          </button>
        )}
      </div>
      <figcaption class="small muted">
        {!hideCaption && <span>{p.caption}{p.shows === 'same_family' ? ' (earlier variant)' : ''}. </span>}
        Photo: {p.author || 'unknown'} ·{' '}
        <a href={p.licence_url || p.page_url} target="_blank" rel="noopener noreferrer">{p.licence}</a> ·{' '}
        <a href={p.page_url} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
      </figcaption>
    </figure>
  );
}
