import {
  gamificationDB,
  withoutScoutProfileRemoteSyncQueue,
} from '@/game-template/gamification/database';
import { normalizeScoutProfileName } from './canonicalDocumentIdentity';
import type { ScoutProfileSyncPayload } from './scoutProfileDocuments';

export async function loadScoutProfileSyncPayload(
  scoutName: string
): Promise<ScoutProfileSyncPayload | undefined> {
  const normalizedName = normalizeScoutProfileName(scoutName);
  const scouts = await gamificationDB.scouts.toArray();
  const scout = scouts.find(candidate => normalizeScoutProfileName(candidate.name) === normalizedName);

  if (!scout) {
    return undefined;
  }

  const [predictions, achievements] = await Promise.all([
    gamificationDB.predictions.toArray(),
    gamificationDB.scoutAchievements.toArray(),
  ]);

  return {
    scout,
    predictions: predictions.filter(
      prediction => normalizeScoutProfileName(prediction.scoutName) === normalizedName
    ),
    achievements: achievements.filter(
      achievement => normalizeScoutProfileName(achievement.scoutName) === normalizedName
    ),
  };
}

export async function loadAllScoutProfileSyncPayloads(): Promise<ScoutProfileSyncPayload[]> {
  const scouts = await gamificationDB.scouts.toArray();
  return (
    await Promise.all(scouts.map(scout => loadScoutProfileSyncPayload(scout.name)))
  ).filter((payload): payload is ScoutProfileSyncPayload => payload !== undefined);
}

export async function saveScoutProfileSyncPayload(
  payload: ScoutProfileSyncPayload
): Promise<void> {
  const normalizedName = normalizeScoutProfileName(payload.scout.name);

  await withoutScoutProfileRemoteSyncQueue(async () => {
    await gamificationDB.transaction(
      'rw',
      [
        gamificationDB.scouts,
        gamificationDB.predictions,
        gamificationDB.scoutAchievements,
      ],
      async () => {
      const [scouts, predictions, achievements] = await Promise.all([
        gamificationDB.scouts.toArray(),
        gamificationDB.predictions.toArray(),
        gamificationDB.scoutAchievements.toArray(),
      ]);
      const oldScoutNames = scouts
        .filter(scout => normalizeScoutProfileName(scout.name) === normalizedName)
        .map(scout => scout.name);
      const oldPredictionIds = predictions
        .filter(prediction => normalizeScoutProfileName(prediction.scoutName) === normalizedName)
        .map(prediction => prediction.id);
      const oldAchievementKeys = achievements
        .filter(achievement => normalizeScoutProfileName(achievement.scoutName) === normalizedName)
        .map(
          achievement =>
            [achievement.scoutName, achievement.achievementId] as [string, string]
        );

      await Promise.all([
        gamificationDB.scouts.bulkDelete(oldScoutNames),
        gamificationDB.predictions.bulkDelete(oldPredictionIds),
        gamificationDB.scoutAchievements.bulkDelete(oldAchievementKeys),
      ]);
      await gamificationDB.scouts.put(payload.scout);

      if (payload.predictions.length > 0) {
        await gamificationDB.predictions.bulkPut(payload.predictions);
      }

      if (payload.achievements.length > 0) {
        await gamificationDB.scoutAchievements.bulkPut(payload.achievements);
      }
      }
    );
  });
}

export async function renameScoutProfileSyncPayload(
  currentName: string,
  replacementName: string
): Promise<void> {
  const payload = await loadScoutProfileSyncPayload(currentName);

  if (!payload) {
    throw new Error('Local Scout profile was not found.');
  }

  const replacementIdentity = normalizeScoutProfileName(replacementName);
  const existingReplacement = await loadScoutProfileSyncPayload(replacementName);

  if (
    existingReplacement &&
    normalizeScoutProfileName(existingReplacement.scout.name) === replacementIdentity
  ) {
    throw new Error('The replacement Scout name already exists locally.');
  }

  await deleteScoutProfileSyncPayload(currentName);

  await saveScoutProfileSyncPayload({
    scout: {
      ...payload.scout,
      name: replacementName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    },
    predictions: payload.predictions.map(prediction => ({
      ...prediction,
      scoutName: replacementName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    })),
    achievements: payload.achievements.map(achievement => ({
      ...achievement,
      scoutName: replacementName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    })),
  });
}

async function deleteScoutProfileSyncPayload(scoutName: string): Promise<void> {
  const normalizedName = normalizeScoutProfileName(scoutName);

  await withoutScoutProfileRemoteSyncQueue(async () => {
    await gamificationDB.transaction(
      'rw',
      [
        gamificationDB.scouts,
        gamificationDB.predictions,
        gamificationDB.scoutAchievements,
      ],
      async () => {
        const [scouts, predictions, achievements] = await Promise.all([
          gamificationDB.scouts.toArray(),
          gamificationDB.predictions.toArray(),
          gamificationDB.scoutAchievements.toArray(),
        ]);

        await Promise.all([
          gamificationDB.scouts.bulkDelete(
            scouts
              .filter(scout => normalizeScoutProfileName(scout.name) === normalizedName)
              .map(scout => scout.name)
          ),
          gamificationDB.predictions.bulkDelete(
            predictions
              .filter(
                prediction =>
                  normalizeScoutProfileName(prediction.scoutName) === normalizedName
              )
              .map(prediction => prediction.id)
          ),
          gamificationDB.scoutAchievements.bulkDelete(
            achievements
              .filter(
                achievement =>
                  normalizeScoutProfileName(achievement.scoutName) === normalizedName
              )
              .map(
                achievement =>
                  [achievement.scoutName, achievement.achievementId] as [string, string]
              )
          ),
        ]);
      }
    );
  });
}
