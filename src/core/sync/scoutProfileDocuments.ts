import type { Scout, MatchPrediction, ScoutAchievement } from '@/game-template/gamification';
import {
  createCanonicalDocumentIdentity,
  normalizeScoutProfileName,
} from './canonicalDocumentIdentity';
import type { CanonicalSyncDocument } from './types';

export interface ScoutProfileSyncPayload {
  scout: Scout;
  predictions: MatchPrediction[];
  achievements: ScoutAchievement[];
}

export type ScoutProfileReconciliation =
  | {
      status: 'no-op' | 'upsert';
      payload: ScoutProfileSyncPayload;
    }
  | {
      status: 'manual-conflict';
      conflict: {
        kind: 'profile-identity' | 'prediction';
        key: string;
        message: string;
      };
    };

export type ScoutProfileSyncDocument = CanonicalSyncDocument<ScoutProfileSyncPayload>;

export function createScoutProfileSyncDocumentCandidate(
  payload: ScoutProfileSyncPayload
): Omit<
  ScoutProfileSyncDocument,
  'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'
> {
  const normalized = reconcileScoutProfile(undefined, payload);

  if (normalized.status !== 'upsert') {
    throw new Error('A new Scout profile must produce a canonical document candidate.');
  }

  const identity = createCanonicalDocumentIdentity({
    documentType: 'scout-profile',
    scoutName: normalized.payload.scout.name,
  });

  return {
    ...identity,
    tombstone: false,
    payload: normalized.payload,
  };
}

export function reconcileScoutProfile(
  existingPayload: ScoutProfileSyncPayload | undefined,
  incomingPayload: ScoutProfileSyncPayload
): ScoutProfileReconciliation {
  const incoming = normalizeScoutProfilePayload(incomingPayload);

  if (!existingPayload) {
    return {
      status: 'upsert',
      payload: incoming,
    };
  }

  const existing = normalizeScoutProfilePayload(existingPayload);
  const existingIdentity = normalizeScoutProfileName(existing.scout.name);
  const incomingIdentity = normalizeScoutProfileName(incoming.scout.name);

  if (existingIdentity !== incomingIdentity) {
    return {
      status: 'manual-conflict',
      conflict: {
        kind: 'profile-identity',
        key: `${existingIdentity}:${incomingIdentity}`,
        message: 'Scout profiles with different normalized names cannot be merged.',
      },
    };
  }

  const displayName = existing.scout.name;
  const predictionMerge = mergePredictions(
    existing.predictions,
    incoming.predictions,
    displayName
  );

  if (predictionMerge.status === 'manual-conflict') {
    return predictionMerge;
  }

  const merged: ScoutProfileSyncPayload = {
    scout: mergeScoutState(existing.scout, incoming.scout, displayName),
    predictions: predictionMerge.predictions,
    achievements: mergeAchievements(existing.achievements, incoming.achievements, displayName),
  };

  return JSON.stringify(merged) === JSON.stringify(existing)
    ? {
        status: 'no-op',
        payload: existing,
      }
    : {
        status: 'upsert',
        payload: merged,
      };
}

function normalizeScoutProfilePayload(payload: ScoutProfileSyncPayload): ScoutProfileSyncPayload {
  const displayName = normalizeDisplayName(payload.scout.name);

  return {
    scout: {
      ...payload.scout,
      name: displayName,
    },
    predictions: payload.predictions
      .map(prediction => normalizePrediction(prediction, displayName))
      .sort(comparePredictions),
    achievements: payload.achievements
      .map(achievement => normalizeAchievement(achievement, displayName))
      .sort(compareAchievements),
  };
}

function mergeScoutState(existing: Scout, incoming: Scout, displayName: string): Scout {
  const incomingIsNewer = incoming.lastUpdated > existing.lastUpdated;

  return {
    name: displayName,
    stakes: Math.max(existing.stakes, incoming.stakes),
    stakesFromPredictions: Math.max(
      existing.stakesFromPredictions,
      incoming.stakesFromPredictions
    ),
    totalPredictions: Math.max(existing.totalPredictions, incoming.totalPredictions),
    correctPredictions: Math.max(existing.correctPredictions, incoming.correctPredictions),
    currentStreak: incomingIsNewer ? incoming.currentStreak : existing.currentStreak,
    longestStreak: Math.max(existing.longestStreak, incoming.longestStreak),
    detailedCommentsCount: Math.max(
      existing.detailedCommentsCount,
      incoming.detailedCommentsCount
    ),
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    lastUpdated: Math.max(existing.lastUpdated, incoming.lastUpdated),
  };
}

function mergePredictions(
  existingPredictions: MatchPrediction[],
  incomingPredictions: MatchPrediction[],
  displayName: string
):
  | { status: 'merged'; predictions: MatchPrediction[] }
  | Extract<ScoutProfileReconciliation, { status: 'manual-conflict' }> {
  const predictionsByKey = new Map<string, MatchPrediction>();

  for (const prediction of existingPredictions) {
    const normalized = normalizePrediction(prediction, displayName);
    predictionsByKey.set(getPredictionKey(normalized), normalized);
  }

  for (const prediction of incomingPredictions) {
    const normalized = normalizePrediction(prediction, displayName);
    const key = getPredictionKey(normalized);
    const existing = predictionsByKey.get(key);

    if (!existing || normalized.timestamp > existing.timestamp) {
      predictionsByKey.set(key, normalized);
      continue;
    }

    if (normalized.timestamp < existing.timestamp || predictionsAreEqual(existing, normalized)) {
      continue;
    }

    return {
      status: 'manual-conflict',
      conflict: {
        kind: 'prediction',
        key,
        message: 'Predictions with the same identity and timestamp disagree.',
      },
    };
  }

  return {
    status: 'merged',
    predictions: Array.from(predictionsByKey.values()).sort(comparePredictions),
  };
}

function mergeAchievements(
  existingAchievements: ScoutAchievement[],
  incomingAchievements: ScoutAchievement[],
  displayName: string
): ScoutAchievement[] {
  const achievementsByKey = new Map<string, ScoutAchievement>();

  for (const achievement of [...existingAchievements, ...incomingAchievements]) {
    const normalized = normalizeAchievement(achievement, displayName);
    const existing = achievementsByKey.get(normalized.achievementId);

    if (!existing) {
      achievementsByKey.set(normalized.achievementId, normalized);
      continue;
    }

    const earliest = normalized.unlockedAt < existing.unlockedAt ? normalized : existing;
    const existingProgress = existing.progress ?? 0;
    const incomingProgress = normalized.progress ?? 0;

    achievementsByKey.set(normalized.achievementId, {
      ...earliest,
      scoutName: displayName,
      progress: Math.max(existingProgress, incomingProgress),
    });
  }

  return Array.from(achievementsByKey.values()).sort(compareAchievements);
}

function normalizePrediction(
  prediction: MatchPrediction,
  displayName: string
): MatchPrediction {
  return {
    ...prediction,
    scoutName: displayName,
    eventKey: prediction.eventKey.trim().toLowerCase(),
  };
}

function normalizeAchievement(
  achievement: ScoutAchievement,
  displayName: string
): ScoutAchievement {
  return {
    ...achievement,
    achievementId: achievement.achievementId.trim(),
    scoutName: displayName,
  };
}

function getPredictionKey(prediction: MatchPrediction): string {
  return `${prediction.eventKey}:${prediction.matchNumber}`;
}

function comparePredictions(a: MatchPrediction, b: MatchPrediction): number {
  return getPredictionKey(a).localeCompare(getPredictionKey(b));
}

function compareAchievements(a: ScoutAchievement, b: ScoutAchievement): number {
  return a.achievementId.localeCompare(b.achievementId);
}

function predictionsAreEqual(a: MatchPrediction, b: MatchPrediction): boolean {
  return (
    a.eventKey === b.eventKey &&
    a.matchNumber === b.matchNumber &&
    a.predictedWinner === b.predictedWinner &&
    a.actualWinner === b.actualWinner &&
    a.isCorrect === b.isCorrect &&
    a.pointsAwarded === b.pointsAwarded &&
    a.timestamp === b.timestamp &&
    a.verified === b.verified
  );
}

function normalizeDisplayName(name: string): string {
  const displayName = name.normalize('NFKC').trim().replace(/\s+/g, ' ');

  if (!displayName) {
    throw new Error('Scout profile payload requires a Scout name.');
  }

  return displayName;
}
