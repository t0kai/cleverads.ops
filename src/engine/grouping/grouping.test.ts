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
