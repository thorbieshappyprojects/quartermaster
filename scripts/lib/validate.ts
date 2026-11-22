import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { Category, Cost, Source, SourcedNumber, SourcedText, SystemCard } from '../../src/model/types.ts';
import { fileStem, parentDir, type LoadedData } from './load.ts';
import { toEur } from './compile.ts';
import { codeRank } from '../../src/game/ranks.ts';
import type { FxTable, RankForce } from '../../src/model/types.ts';

export type Level = 'error' | 'warning' | 'gap';

export interface Issue {
  level: Level;
  file: string;
  path: string; // dotted field path, '' for the whole file
  message: string;
}

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), '../../schemas');
const readSchema = (name: string) => JSON.parse(readFileSync(join(schemaDir, name), 'utf8'));

let compiled: { category: ValidateFunction; system: ValidateFunction; source: ValidateFunction; ranks: ValidateFunction } | null = null;
function schemas() {
  if (compiled) return compiled;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default ? addFormats.default(ajv) : (addFormats as unknown as (a: unknown) => void)(ajv);
  ajv.addSchema(readSchema('common.schema.json'));
  compiled = {
    category: ajv.compile(readSchema('category.schema.json')),
    system: ajv.compile(readSchema('system.schema.json')),
    source: ajv.compile(readSchema('source.schema.json')),
    ranks: ajv.compile(readSchema('ranks.schema.json')),
  };
  return compiled;
}

/** JSON pointer (/specs/top_speed/value) → dotted path (specs.top_speed.value). */
function toPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((p) => (/^\d+$/.test(p) ? `[${p}]` : p))
    .join('.')
    .replace(/\.\[/g, '[');
}

function describeAjvError(e: ErrorObject): { path: string; message: string } {
  const path = toPath(e.instancePath);
  switch (e.keyword) {
    case 'required':
      return { path, message: `missing required field '${(e.params as { missingProperty: string }).missingProperty}'` };
    case 'additionalProperties':
      return { path, message: `unknown field '${(e.params as { additionalProperty: string }).additionalProperty}'` };
    case 'enum':
      return { path, message: `must be one of: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')}` };
    case 'pattern':
      return { path, message: `has an invalid format (expected pattern ${(e.params as { pattern: string }).pattern})` };
    case 'format':
      return { path, message: `must be a valid ${(e.params as { format: string }).format}` };
    default:
      return { path, message: e.message ?? e.keyword };
  }
}

/** Ajv reports every failing branch of a oneOf; keep the most specific errors only. */
function schemaIssues(file: string, errors: ErrorObject[] | null | undefined): Issue[] {
  if (!errors) return [];
  const seen = new Set<string>();
  const issues: Issue[] = [];
  const branchy = new Set(['oneOf', 'anyOf', 'if']);
  for (const e of errors) {
    if (branchy.has(e.keyword)) continue;
    // A null-vs-object oneOf produces "must be null" next to the real error; skip that half.
    if (e.keyword === 'type' && (e.params as { type: string }).type === 'null') continue;
    const d = describeAjvError(e);
    const key = `${d.path}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({ level: 'error', file, ...d });
  }
  return issues;
}

const today = () => new Date().toISOString().slice(0, 10);

function checkSources(file: string, sources: Source[], issues: Issue[]) {
  const ids = new Set<string>();
  sources.forEach((s, i) => {
    if (ids.has(s.id)) issues.push({ level: 'error', file, path: `sources[${i}].id`, message: `duplicate source id '${s.id}'` });
    ids.add(s.id);
    if (s.retrieved > today())
      issues.push({ level: 'error', file, path: `sources[${i}].retrieved`, message: `retrieval date ${s.retrieved} is in the future` });
    if (/wikipedia\.org/.test(s.url))
      issues.push({
        level: 'warning',
        file,
        path: `sources[${i}].url`,
        message: 'Wikipedia is a pointer only; cite the underlying source where one exists',
      });
  });
}

interface RefContext {
  file: string;
  local: Set<string>;
  shared: Set<string>;
  used: Set<string>;
  issues: Issue[];
}

function checkRef(ctx: RefContext, path: string, ref: string | null | undefined) {
  if (ref == null) return;
  if (ref.startsWith('@')) {
    if (!ctx.shared.has(ref.slice(1)))
      ctx.issues.push({ level: 'error', file: ctx.file, path, message: `shared source '${ref}' does not exist in data/sources/` });
    return;
  }
  ctx.used.add(ref);
  if (!ctx.local.has(ref))
    ctx.issues.push({ level: 'error', file: ctx.file, path, message: `source '${ref}' is not listed in this file's sources` });
}

function checkSourcedNumber(ctx: RefContext, path: string, v: SourcedNumber | undefined, gapLabel: string) {
  if (!v) return;
  checkRef(ctx, `${path}.source`, v.source);
  if (v.value === null) {
    ctx.issues.push({ level: 'gap', file: ctx.file, path, message: `${gapLabel}: no public value recorded` });
    if (v.range) ctx.issues.push({ level: 'error', file: ctx.file, path: `${path}.range`, message: 'range is set but no displayed value is chosen' });
    return;
  }
  if (!v.source)
    ctx.issues.push({ level: 'error', file: ctx.file, path: `${path}.source`, message: 'has a value but no source (every value needs a source)' });
  if (!v.confidence)
    ctx.issues.push({ level: 'error', file: ctx.file, path: `${path}.confidence`, message: 'has a value but no confidence (high, medium or low)' });
  if (v.range) {
    if (v.range.min > v.range.max)
      ctx.issues.push({ level: 'error', file: ctx.file, path: `${path}.range`, message: `range min ${v.range.min} is above max ${v.range.max}` });
    else if (v.value < v.range.min || v.value > v.range.max)
      ctx.issues.push({
        level: 'error',
        file: ctx.file,
        path: `${path}.value`,
        message: `displayed value ${v.value} lies outside its range ${v.range.min}–${v.range.max}`,
      });
  }
}

function checkCost(ctx: RefContext, path: string, c: Cost | undefined) {
  if (!c) return;
  checkSourcedNumber(ctx, path, c, 'unit cost');
  if (c.value === null) return;
  for (const f of ['currency', 'price_year', 'basis'] as const)
    if (c[f] == null)
      ctx.issues.push({ level: 'error', file: ctx.file, path: `${path}.${f}`, message: `cost has a value but no ${f.replace('_', ' ')}` });
}

function checkTexts(ctx: RefContext, path: string, items: (SourcedText | undefined)[]) {
  items.forEach((t, i) => t && checkRef(ctx, items.length > 1 ? `${path}[${i}].source` : `${path}.source`, t.source));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown) => Array.isArray(v) && v.every(isObj);

/** Enough structure to run the cross-file checks after a schema failure, so all problems show at once. */
function systemShape(d: unknown): boolean {
  if (!isObj(d)) return false;
  return typeof d.id === 'string' && typeof d.category === 'string' && isObj(d.specs) && Object.values(d.specs).every(isObj)
    && arr(d.sources) && arr(d.operators) && Array.isArray(d.peers) && isObj(d.cost)
    && isObj(d.in_service_since) && isObj(d.units_built)
    && (d.contracts === undefined || arr(d.contracts)) && (d.production_sites === undefined || arr(d.production_sites));
}
function categoryShape(d: unknown): boolean {
  if (!isObj(d) || typeof d.id !== 'string' || !arr(d.indicators) || !arr(d.sources) || !isObj(d.category_card)) return false;
  const cc = d.category_card;
  return ['purpose', 'strengths', 'weaknesses', 'counters', 'trends'].every((k) => arr(cc[k]));
}

export interface ValidationResult {
  issues: Issue[];
  errors: Issue[];
  ok: boolean;
}

export function validate(data: LoadedData): ValidationResult {
  const s = schemas();
  const issues: Issue[] = data.parseErrors.map((p) => ({ level: 'error' as const, file: p.file, path: '', message: p.message }));

  // Shared sources
  const shared = new Set<string>();
  for (const f of data.sources) {
    if (!s.source(f.data)) {
      issues.push(...schemaIssues(f.file, s.source.errors));
      continue;
    }
    const list = (f.data as { sources: Source[] }).sources;
    checkSources(f.file, list, issues);
    for (const src of list) {
      if (shared.has(src.id)) issues.push({ level: 'error', file: f.file, path: '', message: `shared source id '${src.id}' is defined twice` });
      shared.add(src.id);
    }
  }

  // Categories
  const categories = new Map<string, Category>();
  for (const f of data.categories) {
    if (!s.category(f.data)) {
      issues.push(...schemaIssues(f.file, s.category.errors));
      if (!categoryShape(f.data)) continue; // too malformed for the cross-file checks
    }
    const c = f.data as Category;
    if (c.id !== fileStem(f.file)) issues.push({ level: 'error', file: f.file, path: 'id', message: `id '${c.id}' must match the file name '${fileStem(f.file)}'` });
    if (categories.has(c.id)) issues.push({ level: 'error', file: f.file, path: 'id', message: `duplicate category id '${c.id}'` });
    categories.set(c.id, c);
    checkSources(f.file, c.sources, issues);
    const ind = new Set<string>();
    c.indicators.forEach((i, n) => {
      if (ind.has(i.id)) issues.push({ level: 'error', file: f.file, path: `indicators[${n}].id`, message: `duplicate indicator '${i.id}'` });
      ind.add(i.id);
    });
    c.indicators.forEach((i, n) => {
      if (!i.derived) return;
      for (const k of [i.derived.numerator, i.derived.denominator])
        if (!ind.has(k) || c.indicators.find((x) => x.id === k)?.derived)
          issues.push({ level: 'error', file: f.file, path: `indicators[${n}].derived`, message: `derived from '${k}', which is not a stored indicator of this category` });
    });
    const ctx: RefContext = { file: f.file, local: new Set(c.sources.map((x) => x.id)), shared, used: new Set(), issues };
    for (const key of ['purpose', 'strengths', 'weaknesses', 'counters', 'trends'] as const) {
      c.category_card[key].forEach((t, i) => checkRef(ctx, `category_card.${key}[${i}].source`, t.source));
      if (c.category_card[key].length === 0)
        issues.push({ level: 'gap', file: f.file, path: `category_card.${key}`, message: `category card has no ${key}` });
    }
    c.sources.forEach((src, i) => {
      if (!ctx.used.has(src.id)) issues.push({ level: 'warning', file: f.file, path: `sources[${i}]`, message: `source '${src.id}' is never referenced` });
    });
  }

  // Systems
  const systems = new Map<string, { file: string; card: SystemCard }>();
  for (const f of data.systems) {
    if (!s.system(f.data)) {
      issues.push(...schemaIssues(f.file, s.system.errors));
      if (!systemShape(f.data)) continue; // too malformed for the cross-file checks
    }
    const card = f.data as SystemCard;
    if (card.id !== fileStem(f.file)) issues.push({ level: 'error', file: f.file, path: 'id', message: `id '${card.id}' must match the file name '${fileStem(f.file)}'` });
    if (card.category !== parentDir(f.file))
      issues.push({ level: 'error', file: f.file, path: 'category', message: `category '${card.category}' must match the folder '${parentDir(f.file)}'` });
    if (systems.has(card.id)) issues.push({ level: 'error', file: f.file, path: 'id', message: `duplicate system id '${card.id}' (also in ${systems.get(card.id)!.file})` });
    systems.set(card.id, { file: f.file, card });
  }

  for (const { file, card } of systems.values()) {
    checkSources(file, card.sources, issues);
    const ctx: RefContext = { file, local: new Set(card.sources.map((x) => x.id)), shared, used: new Set(), issues };
    const cat = categories.get(card.category);
    if (!cat) {
      issues.push({ level: 'error', file, path: 'category', message: `category '${card.category}' does not exist in data/categories/` });
    } else {
      const stored = cat.indicators.filter((i) => !i.derived);
      const derived = new Set(cat.indicators.filter((i) => i.derived).map((i) => i.id));
      const known = new Set(cat.indicators.map((i) => i.id));
      for (const key of Object.keys(card.specs)) {
        if (derived.has(key))
          issues.push({ level: 'error', file, path: `specs.${key}`, message: `'${key}' is calculated at build time; remove it from the card` });
        else if (!known.has(key))
          issues.push({ level: 'error', file, path: `specs.${key}`, message: `unknown indicator '${key}' for category '${cat.id}' (known: ${stored.map((i) => i.id).join(', ')})` });
      }
      for (const i of stored) {
        if (!(i.id in card.specs))
          issues.push({ level: 'error', file, path: `specs`, message: `missing indicator '${i.id}' (add it with value: null if no public figure exists)` });
        else checkSourcedNumber(ctx, `specs.${i.id}`, card.specs[i.id], i.label);
      }
    }
    checkSourcedNumber(ctx, 'in_service_since', card.in_service_since, 'in service since');
    checkSourcedNumber(ctx, 'units_built', card.units_built, 'units built');
    checkCost(ctx, 'cost', card.cost);
    if (card.cost?.value != null && card.cost.currency && card.cost.price_year && !toEur(card.cost, data.fx[0]?.data as FxTable | undefined))
      issues.push({ level: 'warning', file, path: 'cost', message: `no ECB rate for ${card.cost.currency} ${card.cost.price_year}; cost is shown without EUR conversion (run npm run fetch:fx)` });
    checkTexts(ctx, 'memorable_fact', [card.memorable_fact]);
    checkTexts(ctx, 'combat_use', [card.combat_use]);
    if (!card.memorable_fact) issues.push({ level: 'gap', file, path: 'memorable_fact', message: 'no memorable fact' });
    card.production_sites?.forEach((p, i) => checkRef(ctx, `production_sites[${i}].source`, p.source));
    card.operators.forEach((o, i) => checkRef(ctx, `operators[${i}].source`, o.source));
    card.contracts?.forEach((c, i) => checkRef(ctx, `contracts[${i}].source`, c.source));
    card.peers.forEach((p, i) => {
      if (p === card.id) issues.push({ level: 'error', file, path: `peers[${i}]`, message: 'a system cannot be its own peer' });
      else if (!systems.has(p)) issues.push({ level: 'error', file, path: `peers[${i}]`, message: `peer '${p}' does not exist` });
    });
    card.sources.forEach((src, i) => {
      if (!ctx.used.has(src.id)) issues.push({ level: 'warning', file, path: `sources[${i}]`, message: `source '${src.id}' is never referenced` });
    });
  }

  checkRanks(data, issues);

  const errors = issues.filter((i) => i.level === 'error');
  return { issues, errors, ok: errors.length === 0 };
}

export function formatIssue(i: Issue): string {
  const where = i.path ? `${i.file} → ${i.path}` : i.file;
  return `${i.level.toUpperCase().padEnd(7)} ${where}: ${i.message}`;
}

function checkRanks(data: LoadedData, issues: Issue[]) {
  const s = schemas();
  const ids = new Map<string, string>();
  for (const f of data.ranks) {
    if (!s.ranks(f.data)) {
      issues.push(...schemaIssues(f.file, s.ranks.errors));
      const d = f.data as Partial<RankForce>;
      if (!Array.isArray(d?.ranks) || !Array.isArray(d?.sources)) continue;
    }
    const r = f.data as RankForce;
    if (r.id !== fileStem(f.file)) issues.push({ level: 'error', file: f.file, path: 'id', message: `id '${r.id}' must match the file name '${fileStem(f.file)}'` });
    checkSources(f.file, r.sources, issues);
    const local = new Set(r.sources.map((x) => x.id));
    const used = new Set<string>();
    let prev = -1;
    r.ranks.forEach((k, i) => {
      if (ids.has(k.id)) issues.push({ level: 'error', file: f.file, path: `ranks[${i}].id`, message: `rank id '${k.id}' is also used in ${ids.get(k.id)}` });
      ids.set(k.id, f.file);
      if (!local.has(k.source)) issues.push({ level: 'error', file: f.file, path: `ranks[${i}].source`, message: `unknown source '${k.source}'` });
      used.add(k.source);
      const c = codeRank(k.code);
      if (c < prev) issues.push({ level: 'error', file: f.file, path: `ranks[${i}].code`, message: `ranks must be listed most junior first ('${k.code}' after a more senior code)` });
      prev = Math.max(prev, c);
      if (r.nato_graded === false && !k.approximate)
        issues.push({ level: 'error', file: f.file, path: `ranks[${i}].approximate`, message: 'country is outside the NATO scheme: mark the code approximate' });
    });
    r.sources.forEach((x, i) => {
      if (!used.has(x.id)) issues.push({ level: 'warning', file: f.file, path: `sources[${i}]`, message: `source '${x.id}' is never referenced` });
    });
  }
  for (const f of data.insignia) {
    for (const id of Object.keys((f.data as { insignia?: Record<string, unknown> }).insignia ?? {}))
      if (!ids.has(id)) issues.push({ level: 'warning', file: f.file, path: `insignia.${id}`, message: `no rank with id '${id}'` });
  }
}
