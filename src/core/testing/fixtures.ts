import { db, pitDB } from '@/db';
import type { PitScoutingEntryBase } from '@/core/types/pit-scouting';
import type { ScoutingEntryBase, ScoutingDataExport } from '@/core/types/scouting-entry';
import type { Scout } from '@/core/types/gamification';
import type { MatchPrediction, ScoutAchievement } from '@/game-template/gamification';
import { gamificationDB } from '@/game-template/gamification';
import { gameDataTransformation } from '@/game-template/transformation';

export interface TestHarnessFixture {
  localStorage?: Record<string, string>;
  scoutingEntries?: ScoutingEntryBase[];
  scoutingExport?: ScoutingDataExport;
  pitScoutingEntries?: PitScoutingEntryBase[];
  scouts?: Scout[];
  predictions?: MatchPrediction[];
  achievements?: ScoutAchievement[];
}

const FIXTURE_TIMESTAMP = 1_735_739_100_000;
const FIXTURE_EVENT_KEY = '2025test';

const minimalScoutingEntry: ScoutingEntryBase = {
  id: 'fixture-entry-1',
  teamNumber: 3314,
  matchNumber: 1,
  matchKey: 'qm1',
  allianceColor: 'red',
  scoutName: 'Test Scout',
  eventKey: FIXTURE_EVENT_KEY,
  timestamp: FIXTURE_TIMESTAMP,
  comments: 'Fixture scouting entry',
  gameData: gameDataTransformation.transformActionsToCounters({
    autoActions: [{ actionType: 'action1', timestamp: FIXTURE_TIMESTAMP }],
    teleopActions: [{ actionType: 'teleopSpecial', timestamp: FIXTURE_TIMESTAMP + 1_000 }],
    autoRobotStatus: { autoToggle: true },
    teleopRobotStatus: { teleopToggle: false },
    endgameRobotStatus: {
      option1: true,
      option2: false,
      option3: false,
      toggle1: false,
      toggle2: false,
    },
    startPosition: [true, false, false, false],
  }),
};

const minimalScout: Scout = {
  name: 'Test Scout',
  stakes: 25,
  stakesFromPredictions: 20,
  totalPredictions: 2,
  correctPredictions: 1,
  currentStreak: 1,
  longestStreak: 1,
  detailedCommentsCount: 1,
  createdAt: FIXTURE_TIMESTAMP,
  lastUpdated: FIXTURE_TIMESTAMP,
};

const minimalPrediction: MatchPrediction = {
  id: 'fixture-prediction-1',
  scoutName: 'Test Scout',
  eventKey: FIXTURE_EVENT_KEY,
  matchNumber: 1,
  predictedWinner: 'red',
  timestamp: FIXTURE_TIMESTAMP,
  verified: true,
  isCorrect: true,
  pointsAwarded: 10,
};

const minimalPitEntry: PitScoutingEntryBase = {
  id: 'fixture-pit-1',
  teamNumber: 3314,
  eventKey: FIXTURE_EVENT_KEY,
  scoutName: 'Pit Scout',
  timestamp: FIXTURE_TIMESTAMP,
  drivetrain: 'swerve',
  notes: 'Fixture pit entry',
  gameData: {
    framePerimeter: 'max',
  },
};

const minimalAchievement: ScoutAchievement = {
  id: 'fixture-achievement-1',
  achievementId: 'first-prediction',
  scoutName: 'Test Scout',
  unlockedAt: FIXTURE_TIMESTAMP,
  progress: 1,
};

export const emptyStateFixture: TestHarnessFixture = {
  localStorage: {},
};

export const minimalScoutingLifecycleFixture: TestHarnessFixture = {
  localStorage: {
    eventKey: FIXTURE_EVENT_KEY,
    playerStation: 'lead',
    matchData: JSON.stringify([
      {
        matchNum: 1,
        redAlliance: [3314, 254, 118],
        blueAlliance: [1678, 1323, 111],
      },
    ]),
  },
  scoutingEntries: [minimalScoutingEntry],
  scouts: [minimalScout],
  predictions: [minimalPrediction],
};

export const importedExportedDataFixture: TestHarnessFixture = {
  localStorage: {
    eventKey: FIXTURE_EVENT_KEY,
  },
  scoutingExport: {
    entries: [minimalScoutingEntry],
    exportedAt: FIXTURE_TIMESTAMP,
    version: '3.0-maneuver-core',
  },
  scouts: [minimalScout],
  predictions: [minimalPrediction],
  achievements: [minimalAchievement],
};

export const persistedOfflineDataFixture: TestHarnessFixture = {
  localStorage: {
    eventKey: FIXTURE_EVENT_KEY,
    playerStation: 'red-1',
    'vite-ui-theme': 'dark',
    matchData: JSON.stringify([
      {
        matchNum: 1,
        redAlliance: [3314, 254, 118],
        blueAlliance: [1678, 1323, 111],
      },
      {
        matchNum: 2,
        redAlliance: [3314, 148, 2056],
        blueAlliance: [254, 1678, 111],
      },
    ]),
  },
  scoutingEntries: [
    minimalScoutingEntry,
    {
      ...minimalScoutingEntry,
      id: 'fixture-entry-2',
      matchNumber: 2,
      matchKey: 'qm2',
      allianceColor: 'blue',
      timestamp: FIXTURE_TIMESTAMP + 5_000,
    },
  ],
  pitScoutingEntries: [minimalPitEntry],
  scouts: [minimalScout],
  predictions: [minimalPrediction],
  achievements: [minimalAchievement],
};

export async function resetTestHarnessState(): Promise<void> {
  window.localStorage.clear();
  window.sessionStorage.clear();

  await Promise.all([
    db.scoutingData.clear(),
    pitDB.pitScoutingData.clear(),
    gamificationDB.scouts.clear(),
    gamificationDB.predictions.clear(),
    gamificationDB.scoutAchievements.clear(),
  ]);
}

export async function loadTestHarnessFixture(fixture: TestHarnessFixture = emptyStateFixture): Promise<void> {
  await resetTestHarnessState();

  Object.entries(fixture.localStorage ?? {}).forEach(([key, value]) => {
    window.localStorage.setItem(key, value);
  });

  const scoutingEntries = fixture.scoutingEntries ?? fixture.scoutingExport?.entries ?? [];

  await Promise.all([
    scoutingEntries.length > 0 ? db.scoutingData.bulkPut(scoutingEntries) : Promise.resolve(),
    fixture.pitScoutingEntries?.length
      ? pitDB.pitScoutingData.bulkPut(fixture.pitScoutingEntries)
      : Promise.resolve(),
    fixture.scouts?.length ? gamificationDB.scouts.bulkPut(fixture.scouts) : Promise.resolve(),
    fixture.predictions?.length
      ? gamificationDB.predictions.bulkPut(fixture.predictions)
      : Promise.resolve(),
    fixture.achievements?.length
      ? gamificationDB.scoutAchievements.bulkPut(fixture.achievements)
      : Promise.resolve(),
  ]);
}
