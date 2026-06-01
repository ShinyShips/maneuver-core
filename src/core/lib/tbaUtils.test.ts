import { describe, expect, it } from 'vitest';

import { buildMatchKey, parseMatchKey } from './tbaUtils';

describe('parseMatchKey', () => {
  it('builds qualification match keys', () => {
    expect(buildMatchKey('2025mrcmp', 15)).toBe('2025mrcmp_qm15');
  });

  it('builds playoff match keys with set numbers', () => {
    expect(buildMatchKey('2025mrcmp', 1, 'sf', 7)).toBe('2025mrcmp_sf7m1');
    expect(buildMatchKey('2025mrcmp', 2, 'f', 1)).toBe('2025mrcmp_f1m2');
  });

  it('round-trips playoff match keys through the builder and parser', () => {
    expect(parseMatchKey(buildMatchKey('2025mrcmp', 1, 'sf', 7))).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'sf',
      setNumber: 7,
      matchNumber: 1,
    });
  });

  it('parses qualification match keys', () => {
    expect(parseMatchKey('2025mrcmp_qm15')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'qm',
      setNumber: 1,
      matchNumber: 15,
    });
  });

  it('parses semifinal match keys', () => {
    expect(parseMatchKey('2025mrcmp_sf1m1')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'sf',
      setNumber: 1,
      matchNumber: 1,
    });
  });

  it('keeps different semifinal sets distinct', () => {
    expect(parseMatchKey('2025mrcmp_sf7m1')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'sf',
      setNumber: 7,
      matchNumber: 1,
    });
  });

  it('parses final match keys', () => {
    expect(parseMatchKey('2025mrcmp_f1m2')).toEqual({
      eventKey: '2025mrcmp',
      compLevel: 'f',
      setNumber: 1,
      matchNumber: 2,
    });
  });

  it('rejects malformed match keys', () => {
    expect(() => parseMatchKey('2025mrcmp_')).toThrow('Invalid match key format: 2025mrcmp_');
    expect(() => parseMatchKey('2025mrcmp_qm')).toThrow('Invalid match key format: 2025mrcmp_qm');
    expect(() => parseMatchKey('2025mrcmp_sfm1')).toThrow('Invalid match key format: 2025mrcmp_sfm1');
    expect(() => parseMatchKey('2025mrcmp_sf1mx')).toThrow('Invalid match key format: 2025mrcmp_sf1mx');
  });
});
