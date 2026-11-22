import { useMemo, useState } from 'preact/hooks';
import type { Branch, Rank, RankForce } from '../model/types.ts';
import { deck } from '../data/deck.ts';
import { BRANCH_LABEL, codesInUse, equivalenceRound, insigniaRound, isOrdered, orderRound, type ChoiceRound } from '../game/ranks.ts';
import { countryName, flag } from '../game/countries.ts';
import { route } from './router.ts';
import { updateProgress } from './store.ts';

const MODES = [
  { id: '', label: 'Browse' },
  { id: 'table', label: 'Equivalents' },
  { id: 'insignia', label: 'Insignia quiz' },
  { id: 'match', label: 'Match ranks' },
  { id: 'order', label: 'Put in order' },
];

const forceLabel = (f: RankForce) => `${flag(f.country)} ${f.force_en}`;

function score(key: string, ok: boolean) {
  updateProgress((p) => {
    const q = p.quiz[key] ?? { right: 0, wrong: 0 };
    return { ...p, quiz: { ...p.quiz, [key]: { right: q.right + (ok ? 1 : 0), wrong: q.wrong + (ok ? 0 : 1) } } };
  });
}

export function RanksPage() {
  const mode = route.value.parts[1] ?? '';
  const forces = deck.ranks ?? [];
  return (
    <div class="stack">
      <h1>Ranks</h1>
      <div class="chips" role="tablist" aria-label="Mode">
        {MODES.map((m) => (
          <a class={`chip${mode === m.id ? ' on' : ''}`} role="tab" aria-selected={mode === m.id} href={`#/ranks${m.id ? '/' + m.id : ''}`}>
            {m.label}
          </a>
        ))}
      </div>
      {!forces.length ? (
        <div class="panel">
          <p>No ranks researched yet.</p>
        </div>
      ) : mode === 'table' ? (
        <EquivalenceTable forces={forces} />
      ) : mode === 'insignia' ? (
        <ChoiceQuiz key="insignia" make={insigniaRound} forces={forces} kind="insignia" />
      ) : mode === 'match' ? (
        <ChoiceQuiz key="match" make={equivalenceRound} forces={forces} kind="match" />
      ) : mode === 'order' ? (
        <OrderQuiz forces={forces} />
      ) : (
        <Browse forces={forces} />
      )}
      <p class="muted small">
        Codes are NATO rank codes (STANAG 2116): OR enlisted and NCOs, WO warrant officers, OF-D officer cadets, OF officers. Equivalence means the same code; it does not mean identical
        responsibilities. Codes marked ≈ are approximate.
      </p>
    </div>
  );
}

function Insignia({ rank, big }: { rank: Rank; big?: boolean }) {
  const i = rank.insignia;
  if (!i) return <span class={`insignia empty${big ? ' big' : ''}`} aria-hidden="true" />;
  return <img class={`insignia${big ? ' big' : ''}`} src={i.image_url} alt={big ? 'Insignia of the mystery rank' : `Insignia: ${rank.name}`} loading="lazy" referrerpolicy="no-referrer" />;
}

function Credit({ rank }: { rank: Rank }) {
  const i = rank.insignia;
  if (!i) return null;
  return (
    <span class="small muted">
      Image: {i.author || 'unknown'} · <a href={i.licence_url || i.page_url} target="_blank" rel="noopener noreferrer">{i.licence}</a> ·{' '}
      <a href={i.page_url} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
    </span>
  );
}

function Browse({ forces }: { forces: RankForce[] }) {
  const [id, setId] = useState(forces[0].id);
  const f = forces.find((x) => x.id === id) ?? forces[0];
  const src = new Map(f.sources.map((s) => [s.id, s]));
  return (
    <div class="stack">
      <div class="chips" role="tablist" aria-label="Service">
        {forces.map((x) => (
          <button class={`chip${x.id === f.id ? ' on' : ''}`} role="tab" aria-selected={x.id === f.id} onClick={() => setId(x.id)}>
            {forceLabel(x)}
          </button>
        ))}
      </div>
      <div class="panel stack">
        <div>
          <h2>{f.force_en}</h2>
          <p class="muted small">
            {f.force} · {countryName(f.country)} · {BRANCH_LABEL[f.branch]} · {f.ranks.length} ranks
          </p>
          {f.note && <p class="small">{f.note}</p>}
        </div>
        <ol class="rank-list" data-testid="rank-list" reversed>
          {[...f.ranks].reverse().map((r) => (
            <li>
              <Insignia rank={r} />
              <span class="code-sm">{r.approximate ? '≈' : ''}{r.code}</span>
              <span>
                <strong>{r.name}</strong>
                {r.abbreviation && <span class="muted"> ({r.abbreviation})</span>}
                <br />
                <span class="small">{r.name_en}{r.role ? ` · ${r.role}` : ''}</span>
                {r.note && <span class="small muted"> · {r.note}</span>}
              </span>
              <a class="small muted" href={src.get(r.source)?.url} target="_blank" rel="noopener noreferrer" title={src.get(r.source)?.title}>
                src
              </a>
            </li>
          ))}
        </ol>
        <details>
          <summary class="small">Sources and image credits</summary>
          <ul class="small">
            {f.sources.map((s) => (
              <li>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> — {s.publisher}, retrieved {s.retrieved}
              </li>
            ))}
            {f.ranks.filter((r) => r.insignia).map((r) => (
              <li>
                {r.name}: <Credit rank={r} />
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

function EquivalenceTable({ forces }: { forces: RankForce[] }) {
  const branches = [...new Set(forces.map((f) => f.branch))] as Branch[];
  const [branch, setBranch] = useState<Branch>(branches[0]);
  const cols = forces.filter((f) => f.branch === branch);
  const codes = codesInUse(cols);
  return (
    <div class="stack">
      <div class="chips" role="tablist" aria-label="Branch">
        {branches.map((b) => (
          <button class={`chip${b === branch ? ' on' : ''}`} role="tab" aria-selected={b === branch} onClick={() => setBranch(b)}>
            {BRANCH_LABEL[b]}
          </button>
        ))}
      </div>
      <div class="compare-wrap">
        <table class="compare ranks-table" data-testid="rank-table" style={{ '--cols': cols.length }}>
          <thead>
            <tr>
              <th scope="col" class="rowhead">Code</th>
              {cols.map((f) => (
                <th scope="col">{forceLabel(f)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr>
                <th scope="row" class="rowhead">{c}</th>
                {cols.map((f) => {
                  const rs = f.ranks.filter((r) => r.code === c);
                  return (
                    <td>
                      {rs.length ? (
                        rs.map((r) => (
                          <div class="rank-cell">
                            <Insignia rank={r} />
                            <span>
                              {r.approximate ? '≈ ' : ''}
                              {r.name}
                              <br />
                              <span class="small muted">{r.name_en}</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <span class="muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChoiceQuiz({ make, forces, kind }: { make: (f: RankForce[], seed: number) => ChoiceRound | null; forces: RankForce[]; kind: 'insignia' | 'match' }) {
  const [seed, setSeed] = useState(() => Date.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const [tally, setTally] = useState({ right: 0, total: 0 });
  const round = useMemo(() => make(forces, seed), [seed]);
  if (!round) return <div class="panel"><p>{kind === 'insignia' ? 'No insignia images yet.' : 'Needs the same service from at least two countries.'}</p></div>;
  const { question: q } = round;
  const answer = (id: string) => {
    const ok = round.correct.has(id);
    setChosen(id);
    setTally((t) => ({ right: t.right + (ok ? 1 : 0), total: t.total + 1 }));
    score(`ranks-${kind}`, ok);
  };
  return (
    <div class="panel stack" data-testid={`ranks-${kind}`}>
      <span class="muted small">Score {tally.right}/{tally.total}</span>
      {kind === 'insignia' ? (
        <div class="stack center">
          <p>{forceLabel(q.force)}: which rank is this?</p>
          <Insignia rank={q.rank} big />
          {chosen && <Credit rank={q.rank} />}
        </div>
      ) : (
        <p>
          <strong>{q.rank.name}</strong> <span class="muted">({q.rank.name_en}, {forceLabel(q.force)})</span> — which rank of the <strong>{round.target!.force_en}</strong> {flag(round.target!.country)} is equivalent?
        </p>
      )}
      <div class="options">
        {round.options.map((o) => (
          <button class={`btn${chosen ? (round.correct.has(o.rank.id) ? ' right' : o.rank.id === chosen ? ' wrong' : '') : ''}`} disabled={!!chosen} onClick={() => answer(o.rank.id)}>
            {o.rank.name}
            {kind === 'match' && chosen && <span class="small muted"> · {o.rank.code}</span>}
          </button>
        ))}
      </div>
      {chosen && (
        <div class="row">
          <span class="small muted">
            {q.rank.name} = {q.rank.code}{q.rank.approximate ? ' (approximate)' : ''} · {q.rank.name_en}
          </span>
          <button class="btn primary" onClick={() => (setChosen(null), setSeed(seed + 1))} autofocus>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function OrderQuiz({ forces }: { forces: RankForce[] }) {
  const [seed, setSeed] = useState(() => Date.now());
  const [picked, setPicked] = useState<Rank[]>([]);
  const [tally, setTally] = useState({ right: 0, total: 0 });
  const round = useMemo(() => orderRound(forces, seed), [seed]);
  if (!round) return <div class="panel"><p>Not enough ranks yet.</p></div>;
  const done = picked.length === round.ranks.length;
  const ok = done && isOrdered(picked);
  const tap = (r: Rank) => {
    if (done || picked.includes(r)) return;
    const next = [...picked, r];
    setPicked(next);
    if (next.length === round.ranks.length) {
      const good = isOrdered(next);
      setTally((t) => ({ right: t.right + (good ? 1 : 0), total: t.total + 1 }));
      score('ranks-order', good);
    }
  };
  const sorted = [...round.ranks].sort((a, b) => round.force.ranks.indexOf(a) - round.force.ranks.indexOf(b));
  return (
    <div class="panel stack" data-testid="ranks-order">
      <span class="muted small">Score {tally.right}/{tally.total}</span>
      <p>
        {forceLabel(round.force)}: tap the ranks from <strong>most junior</strong> to <strong>most senior</strong>.
      </p>
      <div class="options">
        {round.ranks.map((r) => {
          const n = picked.indexOf(r);
          return (
            <button class={`btn${done ? (sorted.indexOf(r) === n ? ' right' : ' wrong') : n >= 0 ? ' sel' : ''}`} disabled={done || n >= 0} onClick={() => tap(r)}>
              {n >= 0 && <span class="code-sm">{n + 1}</span>} {r.name}
              {done && <span class="small muted"> · {r.code}</span>}
            </button>
          );
        })}
      </div>
      {done && (
        <div class="row">
          <span class="small">{ok ? 'Correct.' : `Order: ${sorted.map((r) => r.name).join(' → ')}`}</span>
          <button class="btn primary" onClick={() => (setPicked([]), setSeed(seed + 1))} autofocus>
            Next
          </button>
        </div>
      )}
      {!done && picked.length > 0 && (
        <button class="btn" onClick={() => setPicked([])}>
          Reset
        </button>
      )}
    </div>
  );
}
