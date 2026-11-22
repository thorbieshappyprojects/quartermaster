import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { parse } from 'yaml';

export interface LoadedFile<T = unknown> {
  file: string; // path relative to cwd, for messages
  data: T;
}

export interface LoadedData {
  root: string;
  categories: LoadedFile[];
  systems: LoadedFile[];
  sources: LoadedFile[];
  manufacturers: LoadedFile[];
  fx: LoadedFile[];
  photos: LoadedFile[];
  feedback: LoadedFile[];
  ranks: LoadedFile[];
  insignia: LoadedFile[];
  parseErrors: { file: string; message: string }[];
}

function listYaml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listYaml(p));
    else if (/\.ya?ml$/.test(name)) out.push(p);
  }
  return out;
}

/** Load all YAML under a data root (data/ or a test fixture directory). */
export function loadData(root: string): LoadedData {
  const result: LoadedData = {
    root,
    categories: [],
    systems: [],
    sources: [],
    manufacturers: [],
    fx: [],
    photos: [],
    feedback: [],
    ranks: [],
    insignia: [],
    parseErrors: [],
  };
  const groups = ['categories', 'systems', 'sources', 'manufacturers', 'fx', 'photos', 'feedback', 'ranks', 'insignia'] as const;
  for (const group of groups) {
    for (const path of listYaml(join(root, group))) {
      const file = relative(process.cwd(), path);
      try {
        // YAML dates (2026-11-21) must stay strings so they match the schema's "date" format.
        const data = parse(readFileSync(path, 'utf8'), { schema: 'core' });
        result[group].push({ file, data });
      } catch (e) {
        result.parseErrors.push({ file, message: `YAML parse error: ${(e as Error).message}` });
      }
    }
  }
  return result;
}

export function fileStem(file: string): string {
  return basename(file).replace(/\.ya?ml$/, '');
}

export function parentDir(file: string): string {
  return basename(dirname(file));
}
