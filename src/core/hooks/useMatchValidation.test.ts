import { describe, expect, it } from 'vitest';

import { filterScoutingEntriesForMatch } from './useMatchValidation';

describe('filterScoutingEntriesForMatch', () => {
  it('keeps qualification and playoff entries with the same match number separate', () => {
    const entries = [
      { matchKey: '2025mrcmp_qm1', matchNumber: 1, teamNumber: 111, allianceColor: 'red' as const, scoutName: 'A', gameData: {} },
      { matchKey: '2025mrcmp_sf1m1', matchNumber: 1, teamNumber: 222, allianceColor: 'blue' as const, scoutName: 'B', gameData: {} },
      { matchKey: '2025mrcmp_f1m1', matchNumber: 1, teamNumber: 333, allianceColor: 'red' as const, scoutName: 'C', gameData: {} },
    ];

    expect(filterScoutingEntriesForMatch(entries, '2025mrcmp_qm1')).toEqual([entries[0]]);
    expect(filterScoutingEntriesForMatch(entries, '2025mrcmp_sf1m1')).toEqual([entries[1]]);
    expect(filterScoutingEntriesForMatch(entries, '2025mrcmp_f1m1')).toEqual([entries[2]]);
  });

  it('matches short local keys against full TBA keys', () => {
    const entries = [
      { matchKey: 'qm15', matchNumber: 15, teamNumber: 111, allianceColor: 'red' as const, scoutName: 'A', gameData: {} },
      { matchKey: 'sf1m1', matchNumber: 1, teamNumber: 222, allianceColor: 'blue' as const, scoutName: 'B', gameData: {} },
      { matchKey: 'f1m2', matchNumber: 2, teamNumber: 333, allianceColor: 'red' as const, scoutName: 'C', gameData: {} },
    ];

    expect(filterScoutingEntriesForMatch(entries, '2025mrcmp_qm15')).toEqual([entries[0]]);
    expect(filterScoutingEntriesForMatch(entries, '2025mrcmp_sf1m1')).toEqual([entries[1]]);
    expect(filterScoutingEntriesForMatch(entries, '2025mrcmp_f1m2')).toEqual([entries[2]]);
  });

  it('does not normalize malformed full keys to an empty short key', () => {
    const malformedEntry = {
      matchKey: '2025mrcmp_',
      matchNumber: 0,
      teamNumber: 111,
      allianceColor: 'red' as const,
      scoutName: 'A',
      gameData: {},
    };
    const emptyKeyEntry = {
      matchKey: '',
      matchNumber: 0,
      teamNumber: 222,
      allianceColor: 'blue' as const,
      scoutName: 'B',
      gameData: {},
    };

    expect(filterScoutingEntriesForMatch([malformedEntry, emptyKeyEntry], '2025mrcmp_')).toEqual([malformedEntry]);
  });
});
