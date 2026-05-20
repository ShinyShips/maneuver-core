/* eslint-disable react-refresh/only-export-components */

import type { ComponentProps, ReactNode } from 'react';
import type { FrameworkGameBindings } from '@/core/app/frameworkShell';
import { strategyAnalysis } from '@/game-template/analysis';
import {
  GameSpecificQuestions,
  GameSpecificScoutOptions,
  StatusToggles,
} from '@/game-template/components';
import { scoringCalculations, type ScoutingEntry } from '@/game-template/scoring';
import { gameDataTransformation } from '@/game-template/transformation';
import type {
  ValidationRules,
} from '@/types';
import type {
  MatchValidationResult,
  ValidationConfig,
} from '@/types/game-interfaces';

const CONTRACT_TIMESTAMP = 1_735_739_100_000;
const CONTRACT_EVENT_KEY = '2025test';

const contractValidationThresholds = {
  critical: 25,
  warning: 15,
  minor: 5,
  criticalAbsolute: 5,
  warningAbsolute: 3,
  minorAbsolute: 1,
} satisfies ValidationConfig['thresholds'];

const contractValidationConfig: ValidationConfig = {
  thresholds: contractValidationThresholds,
};

function createCompatibilityContainer(testId: string, children: ReactNode) {
  return <div data-testid={testId}>{children}</div>;
}

function PlaceholderGameStartScreen() {
  return null;
}

function PlaceholderScoringScreen() {
  return null;
}

function CompatibilityStatusToggles(props: ComponentProps<typeof StatusToggles>) {
  return createCompatibilityContainer(
    gameCompatibilitySelectors.statusToggles,
    <StatusToggles {...props} />,
  );
}

function CompatibilityPitScoutingQuestions(
  props: ComponentProps<typeof GameSpecificQuestions>,
) {
  return createCompatibilityContainer(
    gameCompatibilitySelectors.pitScoutingQuestions,
    <GameSpecificQuestions {...props} />,
  );
}

function CompatibilityScoutOptionsContent(
  props: ComponentProps<typeof GameSpecificScoutOptions>,
) {
  return createCompatibilityContainer(
    gameCompatibilitySelectors.scoutOptions,
    <GameSpecificScoutOptions {...props} />,
  );
}

function buildAllianceValidation(
  alliance: 'red' | 'blue',
  entries: ScoutingEntry[],
): MatchValidationResult['redAlliance'] {
  return {
    alliance,
    status: 'passed',
    confidence: 'high',
    dataComplete: true,
    teams: entries.map((entry) => entry.teamNumber),
    scoutNames: entries.map((entry) => entry.scoutName),
    missingTeams: [],
    discrepancies: [],
    scoreDelta: 0,
  };
}

const compatibilityValidation: ValidationRules<ScoutingEntry> = {
  getDataCategories: () => ['auto-actions', 'teleop-actions', 'endgame'],
  calculateAllianceStats: (entries) => ({
    totalPoints: entries.reduce(
      (total, entry) => total + scoringCalculations.calculateTotalPoints(entry),
      0,
    ),
  }),
  calculateAllianceScore: (entries) => {
    const auto = entries.reduce(
      (total, entry) => total + scoringCalculations.calculateAutoPoints(entry),
      0,
    );
    const teleop = entries.reduce(
      (total, entry) => total + scoringCalculations.calculateTeleopPoints(entry),
      0,
    );
    const endgame = entries.reduce(
      (total, entry) => total + scoringCalculations.calculateEndgamePoints(entry),
      0,
    );

    return {
      auto,
      teleop,
      endgame,
      total: auto + teleop + endgame,
    };
  },
  validateMatch: async (scoutedAlliances, tbaMatchData) => {
    const eventKey =
      scoutedAlliances.red[0]?.eventKey ??
      scoutedAlliances.blue[0]?.eventKey ??
      CONTRACT_EVENT_KEY;

    return {
      matchKey: tbaMatchData.key,
      matchNumber: tbaMatchData.match_number,
      eventKey,
      status: 'passed',
      confidence: 'high',
      redAlliance: buildAllianceValidation(
        'red',
        scoutedAlliances.red,
      ),
      blueAlliance: buildAllianceValidation(
        'blue',
        scoutedAlliances.blue,
      ),
      totalDiscrepancies: 0,
      criticalDiscrepancies: 0,
      warningDiscrepancies: 0,
      flaggedForReview: false,
      requiresReScout: false,
      validatedAt: CONTRACT_TIMESTAMP,
    };
  },
  getDefaultConfig: () => contractValidationConfig,
};

export const gameCompatibilitySelectors = {
  pitScoutingQuestions: 'compatibility-pit-scouting-questions',
  scoutOptions: 'compatibility-scout-options',
  statusToggles: 'compatibility-status-toggles',
} as const;

export const gameCompatibilityContractFixture = {
  matchData: {
    autoActions: [{ actionType: 'action1', timestamp: CONTRACT_TIMESTAMP }],
    teleopActions: [{ actionType: 'teleopSpecial', timestamp: CONTRACT_TIMESTAMP + 1_000 }],
    autoRobotStatus: { autoToggle: true },
    teleopRobotStatus: { teleopToggle: false },
    endgameRobotStatus: {
      option1: true,
      option2: false,
      option3: false,
      toggle1: false,
      toggle2: false,
    },
    startPosition: [true, false, false, false, false, false],
  },
  entry: {
    id: 'compatibility-entry-1',
    teamNumber: 3314,
    matchNumber: 1,
    matchKey: 'qm1',
    allianceColor: 'red' as const,
    scoutName: 'Compatibility Scout',
    eventKey: CONTRACT_EVENT_KEY,
    timestamp: CONTRACT_TIMESTAMP,
    comments: 'Compatibility fixture scouting entry',
    gameData: {
      auto: {
        startPosition: 0,
        action1Count: 1,
        action2Count: 0,
        action3Count: 0,
        action4Count: 0,
        autoToggle: true,
      },
      teleop: {
        action1Count: 0,
        action2Count: 0,
        action3Count: 0,
        action4Count: 0,
        teleopSpecialCount: 1,
        teleopToggle: false,
      },
      endgame: {
        option1: true,
        option2: false,
        option3: false,
        toggle1: false,
        toggle2: false,
      },
    },
  } satisfies ScoutingEntry,
};

export const gameCompatibilityBindings: FrameworkGameBindings<ScoutingEntry> = {
  config: {
    year: 2025,
    gameName: 'Template Game',
  },
  scoring: scoringCalculations,
  validation: compatibilityValidation,
  analysis: strategyAnalysis,
  transformation: gameDataTransformation,
  ui: {
    GameStartScreen: PlaceholderGameStartScreen,
    AutoScoringScreen: PlaceholderScoringScreen,
    TeleopScoringScreen: PlaceholderScoringScreen,
    StatusToggles: CompatibilityStatusToggles,
    PitScoutingQuestions: CompatibilityPitScoutingQuestions,
    ScoutOptionsContent: CompatibilityScoutOptionsContent,
  },
};
