# New advertiser module

Copy this folder when an advertiser needs its own rules (different billing, columns or tabs).
An advertiser that works like ACM does not need a module: add it from the app (Add advertiser › Use an existing module).

1. Copy `../acm` to `../<advertiser-id>` and rename the exports.
2. Change `config.ts` (rates and limits), `rules.ts` (the maths) and `sheet.ts` (columns, tabs, formulas).
3. Add a golden test with an anonymised CSV and the numbers you checked by hand.
4. Register it in `../registry.ts`.

Rules: never import another advertiser's folder, never call Google from here. The lint step blocks both.
