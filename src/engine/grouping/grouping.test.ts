import { describe, expect, it } from 'vitest';
import { groupCampaigns } from './groupCampaigns';
import { normalizeKey, splitName } from './names';

describe('splitName', () => {
  it.each([
    ['Campaign 04 - 9000004 2nd', { base: 'Campaign 04 - 9000004', order: 2, label: '2nd' }],
    ['Campaign 04 - 9000004 3RD', { base: 'Campaign 04 - 9000004', order: 3, label: '3rd' }],
    ['Campaign 1st', { base: 'Campaign 1st', order: 1, label: '' }],
    ['FMC - 9334705-2', { base: 'FMC - 9334705-2', order: 1, label: '' }],
  ])('%s', (name, expected) => expect(splitName(name)).toEqual(expected));
});

describe('groupCampaigns', () => {
  it('puts 2nd/3rd under the main, sorted, keeping first-seen order', () => {
    const groups = groupCampaigns([{ name: 'B 2nd' }, { name: 'A' }, { name: 'B' }, { name: 'B 3rd' }]);
    expect(groups.map((g) => g.key)).toEqual(['b', 'a']);
    expect(groups[0]?.members.map((m) => m.item.name)).toEqual(['B', 'B 2nd', 'B 3rd']);
    expect(groups[0]?.hasMain).toBe(true);
  });
  it('flags a 2nd whose main is missing', () => {
    expect(groupCampaigns([{ name: 'C 2nd' }])[0]?.hasMain).toBe(false);
  });
  it('normalises case, spaces and the word IO', () => {
    expect(normalizeKey(' Rabo IO  -  X ')).toBe('rabo - x');
  });
});

describe('tracker spellings that differ from DV360', () => {
  it('treats "-" the same with or without spaces (and en/em dashes)', () => {
    const k = 'matid 100001 - acme widgets - 100001 - november 14, 2026 - 9000001';
    expect(normalizeKey('MatID 100001-Acme Widgets-100001-November 14, 2026-9000001')).toBe(k);
    expect(normalizeKey('MatID 100001 - Acme Widgets - 100001 - November 14, 2026 - 9000001')).toBe(k);
    expect(normalizeKey('MatID 100001 – Acme Widgets —100001- November 14, 2026 -9000001')).toBe(k);
    expect(normalizeKey('Mat ID 100002  - Bay Rugs')).toBe('mat id 100002 - bay rugs');
  });

  const tracker = new Set(['zed tours - 9000002', 'nov 16 promo - 9000003', 'gamma 12']);
  const known = (k: string) => tracker.has(k);

  it.each([
    ['Zed Tours - 9000002 2nd #2', undefined, { base: 'Zed Tours - 9000002', order: 2, label: '2nd' }],
    ['Zed Tours - 9000002 #2', known, { base: 'Zed Tours - 9000002', order: 2, label: '2nd' }],
    ['Zed Tours - 9000002 3', known, { base: 'Zed Tours - 9000002', order: 3, label: '3rd' }],
    // Without the tracker, bare endings stay part of the name.
    ['Zed Tours - 9000002 2', undefined, { base: 'Zed Tours - 9000002 2', order: 1, label: '' }],
    // The full name is itself in the tracker → it is a main IO, not a "2nd".
    ['Gamma 12', known, { base: 'Gamma 12', order: 1, label: '' }],
    // The rest of the name is not in the tracker → the number stays.
    ['Unknown Promo 2', known, { base: 'Unknown Promo 2', order: 1, label: '' }],
    // A long IO number at the end is never read as an order.
    ['Nov 16 Promo - 9000003', known, { base: 'Nov 16 Promo - 9000003', order: 1, label: '' }],
  ] as const)('%s', (name, isKnown, expected) => expect(splitName(name, isKnown)).toEqual(expected));

  it('groups the 2nd IO under its main when the tracker is passed', () => {
    const groups = groupCampaigns([{ name: 'Zed Tours-9000002' }, { name: 'Zed Tours - 9000002 2' }], tracker);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('zed tours - 9000002');
    expect(groups[0]?.members.map((m) => m.order)).toEqual([1, 2]);
  });
});
