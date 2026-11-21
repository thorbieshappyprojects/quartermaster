# Quartermaster

A quartet-style card game for learning military equipment: one card per system, comparable values, playful modes — trumps duel, spaced-repetition flashcards, silhouette quiz, match-up and an operator map.

All data is public, catalogue-level information with a source and confidence for every value. Values without a public source stay empty.

```sh
npm install
npm run dev          # validate data, build deck, start Vite
npm run validate     # check data/ against schemas and rules
npm run report       # gaps, low-confidence values, ranges, cost basis
npm test             # unit tests
npm run build        # production build to dist/
npm run test:e2e     # Playwright smoke test (after build)
```

See `CLAUDE.md` for the data rules and layout, `DEPLOY.md` for hosting.
