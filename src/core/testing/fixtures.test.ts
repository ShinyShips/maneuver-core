import { describe, expect, it } from 'vitest';
import { exportScoutingData } from '@/db';
import { gamificationDB } from '@/game-template/gamification';
import {
  loadTestHarnessFixture,
  minimalScoutingLifecycleFixture,
} from './fixtures';

describe('loadTestHarnessFixture', () => {
  it('loads the minimal scouting lifecycle fixture into framework storage', async () => {
    await loadTestHarnessFixture(minimalScoutingLifecycleFixture);

    const scoutingData = await exportScoutingData();
    const scouts = await gamificationDB.scouts.toArray();

    expect(scoutingData.entries.map((entry) => entry.id)).toEqual(
      minimalScoutingLifecycleFixture.scoutingEntries?.map((entry) => entry.id),
    );
    expect(scouts.map((scout) => scout.name)).toEqual(
      minimalScoutingLifecycleFixture.scouts?.map((scout) => scout.name),
    );
    expect(window.localStorage.getItem('eventKey')).toBe(
      minimalScoutingLifecycleFixture.localStorage?.eventKey,
    );
  });
});
