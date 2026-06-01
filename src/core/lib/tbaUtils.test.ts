import { describe, expect, it } from 'vitest';

import { parseMatchKey } from './tbaUtils';

describe('parseMatchKey', () => {
  it('parses qualification match keys', () => {
    expect(parseMatchKey('2025mrcmp_qm15')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'qm',
      matchNumber: 15,
    });
  });

  it('parses semifinal match keys', () => {
    expect(parseMatchKey('2025mrcmp_sf1m1')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'sf',
      matchNumber: 1,
    });
  });

  it('parses final match keys', () => {
    expect(parseMatchKey('2025mrcmp_f1m2')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'f',
      matchNumber: 2,
    });
  });
});
