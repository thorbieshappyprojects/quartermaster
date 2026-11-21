import { signal } from '@preact/signals';

/** Hash routing: works on any static host without rewrites. */
export const route = signal(parse());

function parse() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}

addEventListener('hashchange', () => {
  route.value = parse();
  window.scrollTo(0, 0);
});

export const go = (hash: string) => {
  location.hash = hash;
};
