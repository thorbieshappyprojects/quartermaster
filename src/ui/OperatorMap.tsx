import { useEffect, useState } from 'preact/hooks';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Operator, OperatorState } from '../model/types.ts';
import { numericCode } from '../game/countries.ts';

type Countries = Feature<Geometry, { name: string }>[];
let cache: Promise<Countries> | null = null;

/** Natural Earth 1:110m countries (public domain), loaded on demand. */
function loadCountries(): Promise<Countries> {
  cache ??= import('world-atlas/countries-110m.json').then((m) => {
    const topo = (m.default ?? m) as unknown as Topology;
    const fc = feature(topo, topo.objects.countries as GeometryCollection) as unknown as FeatureCollection<Geometry, { name: string }>;
    return fc.features;
  });
  return cache;
}

const RANK: Record<OperatorState, number> = { in_service: 3, ordered: 2, evaluating: 1, retired: 0 };

export function OperatorMap({ operators, compact, onCountry }: { operators: Pick<Operator, 'country' | 'state'>[]; compact?: boolean; onCountry?: (iso2: string) => void }) {
  const [features, setFeatures] = useState<Countries | null>(null);
  useEffect(() => {
    loadCountries().then(setFeatures);
  }, []);
  const byNumeric = new Map<string, { state: OperatorState; iso2: string }>();
  for (const o of operators) {
    const n = numericCode(o.country);
    if (!n) continue;
    const cur = byNumeric.get(n);
    if (!cur || RANK[o.state] > RANK[cur.state]) byNumeric.set(n, { state: o.state, iso2: o.country });
  }
  const width = 960;
  const height = compact ? 420 : 500;
  const projection = geoNaturalEarth1().fitSize([width, height], { type: 'Sphere' } as never);
  const path = geoPath(projection);
  return (
    <figure class="map" style={{ margin: 0 }}>
      {features ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="World map of operators">
          {features
            .filter((f) => f.properties.name !== 'Antarctica')
            .map((f) => {
              const hit = byNumeric.get(String(f.id).padStart(3, '0'));
              return (
                <path
                  d={path(f) ?? ''}
                  class={`land${hit ? ` ${hit.state}` : ''}`}
                  style={onCountry ? { cursor: 'pointer' } : undefined}
                  onClick={onCountry && hit ? () => onCountry(hit.iso2) : undefined}
                >
                  <title>{f.properties.name}</title>
                </path>
              );
            })}
        </svg>
      ) : (
        <div style={{ aspectRatio: `${width} / ${height}` }} class="muted small">
          Loading map…
        </div>
      )}
      <figcaption class="legend">
        <span><i style={{ background: 'var(--map-in-service)' }} />in service</span>
        <span><i style={{ background: 'var(--map-ordered)' }} />ordered</span>
        <span><i style={{ background: 'var(--map-retired)' }} />retired / evaluating</span>
        <span class="muted">Map: Natural Earth (public domain)</span>
      </figcaption>
    </figure>
  );
}
