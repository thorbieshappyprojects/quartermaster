// Types mirroring schemas/*.schema.json (raw YAML) and the compiled deck (src/generated/deck.json).
// Keep in sync with the schemas; tests validate fixtures against both.

export type Confidence = 'high' | 'medium' | 'low';
export type Trump = 'higher_wins' | 'lower_wins' | 'not_playable';
export type Status = 'in_production' | 'in_service' | 'retired';
export type CostBasis = 'unit_price' | 'contract_per_unit';
export type OperatorState = 'in_service' | 'ordered' | 'retired' | 'evaluating';
export type SourceKind = 'manufacturer' | 'government' | 'reference' | 'press' | 'other';

export interface Source {
  id: string;
  url: string;
  title: string;
  publisher: string;
  retrieved: string;
  kind?: SourceKind;
  note?: string;
}

export interface Range {
  min: number;
  max: number;
}

export interface SourcedNumber {
  value: number | null;
  range?: Range | null;
  source: string | null;
  confidence: Confidence | null;
  note?: string;
}

export interface SourcedText {
  text: string;
  source: string;
  confidence?: Confidence;
}

export interface Cost extends SourcedNumber {
  currency: string | null;
  price_year: number | null;
  basis: CostBasis | null;
}

export interface Indicator {
  id: string;
  label: string;
  unit: string;
  trump: Trump;
  decimals?: number;
  derived?: { op: 'divide'; numerator: string; denominator: string; factor?: number };
  description?: string;
}

export interface CategoryCard {
  summary?: string;
  purpose: SourcedText[];
  strengths: SourcedText[];
  weaknesses: SourcedText[];
  counters: SourcedText[];
  trends: SourcedText[];
}

export interface Category {
  id: string;
  name: string;
  domain: string;
  wave: number;
  indicators: Indicator[];
  category_card: CategoryCard;
  sources: Source[];
}

export interface Operator {
  country: string;
  force?: string;
  state: OperatorState;
  quantity?: number | null;
  source: string;
  confidence?: Confidence;
  note?: string;
}

export interface Contract {
  customer: string;
  year?: number | null;
  quantity?: number | null;
  value?: number | null;
  currency?: string | null;
  note?: string;
  source: string;
}

export interface SystemCard {
  id: string;
  category: string;
  name: string;
  /** Short qualifier shown under the name, e.g. the configuration the values describe. */
  variant_note?: string;
  family?: string;
  aliases?: string[];
  manufacturer: { name: string; benchmark_slug?: string };
  production_sites?: { place: string; country: string; source: string }[];
  origin: string;
  role: string;
  memorable_fact?: SourcedText;
  status: Status;
  in_service_since: SourcedNumber;
  units_built: SourcedNumber;
  combat_use?: SourcedText;
  specs: Record<string, SourcedNumber>;
  operators: Operator[];
  cost: Cost;
  contracts?: Contract[];
  peers: string[];
  silhouette?: string;
  sources: Source[];
}

/** A spec value after compilation: derived values are filled in and flagged. */
export interface CompiledSpec extends SourcedNumber {
  derived?: boolean;
  /** For derived values: the indicator ids it was computed from. */
  inputs?: string[];
}

/** Cost converted to EUR for comparison (display only; the original cost stays the sourced value). */
export interface EurCost {
  value: number;
  /** Units of the original currency per 1 EUR. */
  rate: number;
  year: number;
  /** Set when the price year has no annual average yet, e.g. "2026-01 to 2026-10". */
  partial?: string;
}

export interface Photo {
  page_url: string;
  image_url: string;
  title: string;
  caption: string;
  shows: 'exact_variant' | 'same_family';
  licence: string;
  licence_url?: string;
  author?: string;
  credit?: string;
  priority: 'A' | 'B';
  retrieved: string;
}

export interface FeedbackItem {
  summary: string;
  quote?: string;
  speaker: string;
  context?: string;
  sentiment: 'positive' | 'mixed' | 'negative';
  topics?: string[];
  source: { url: string; title: string; publisher: string; date?: string; retrieved: string };
  unverified_url?: boolean;
}

export interface CompiledSystem extends Omit<SystemCard, 'specs' | 'cost'> {
  specs: Record<string, CompiledSpec>;
  cost: Cost & { eur?: EurCost };
  photos?: Photo[];
  feedback?: { items: FeedbackItem[]; note?: string };
}

export interface FxTable {
  source: Source;
  annual: Record<string, Record<string, number>>;
  partial_year: { year: number; rates: Record<string, { value: number; months: string }> };
}

export interface Manufacturer {
  slug: string;
  name: string;
  [key: string]: unknown;
}

export type Branch = 'army' | 'air_force' | 'navy';
export type RankGroup = 'enlisted' | 'nco' | 'warrant' | 'officer_cadet' | 'officer' | 'general_flag';

export interface Rank {
  id: string;
  name: string;
  name_en: string;
  abbreviation?: string;
  /** NATO rank code (STANAG 2116), e.g. OF-1; approximate for countries outside the scheme. */
  code: string;
  approximate?: boolean;
  group: RankGroup;
  role?: string;
  note?: string;
  source: string;
  /** Openly licensed insignia image (compiled from data/insignia). */
  insignia?: Photo;
}

export interface RankForce {
  id: string;
  country: string;
  branch: Branch;
  force: string;
  force_en: string;
  nato_graded?: boolean;
  note?: string;
  ranks: Rank[];
  sources: Source[];
}

export interface Deck {
  generated: string;
  categories: Category[];
  systems: CompiledSystem[];
  sharedSources: Source[];
  manufacturers: Manufacturer[];
  ranks: RankForce[];
  /** Source of the exchange rates used for EUR conversion, if any. */
  fxSource?: Source;
}
