import { deck } from '../data/deck.ts';

export function CategoryFilter({ value, onChange, allowAll = true }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  return (
    <div class="chips" role="tablist" aria-label="Category">
      {allowAll && (
        <button class={`chip${value === '' ? ' on' : ''}`} role="tab" aria-selected={value === ''} onClick={() => onChange('')}>
          All
        </button>
      )}
      {deck.categories.map((c) => (
        <button class={`chip${value === c.id ? ' on' : ''}`} role="tab" aria-selected={value === c.id} onClick={() => onChange(c.id)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
