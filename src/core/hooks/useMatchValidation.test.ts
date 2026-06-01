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
});
