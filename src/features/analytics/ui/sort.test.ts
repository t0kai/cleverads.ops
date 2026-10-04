import { describe, expect, it } from 'vitest';
import { compareValues } from './bits';

describe('compareValues', () => {
  it('sorts numbers and text both ways', () => {
    expect([3, 1, 2].sort((a, b) => compareValues(a, b, 'asc'))).toEqual([1, 2, 3]);
    expect(['b', 'a'].sort((a, b) => compareValues(a, b, 'desc'))).toEqual(['b', 'a']);
  });
  it('always puts empty values last', () => {
    expect([null, 2, 1].sort((a, b) => compareValues(a, b, 'asc'))).toEqual([1, 2, null]);
    expect([null, 2, 1].sort((a, b) => compareValues(a, b, 'desc'))).toEqual([2, 1, null]);
  });
});
