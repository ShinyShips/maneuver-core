import { toast } from "sonner";
import { gamificationDB as gameDB, type Scout, type MatchPrediction } from "@/game-template/gamification";
import { normalizeTransferredScoutProfile } from "@/core/lib/normalizeTransferredScoutProfile";
import type { UploadMode } from "./scoutingDataUploadHandler";

const isValidPrediction = (prediction: unknown): prediction is MatchPrediction => {
  if (!prediction || typeof prediction !== 'object') {
    return false;
  }

  const value = prediction as Record<string, unknown>;
  return (
    typeof value.id === 'string' &&
    typeof value.scoutName === 'string' &&
    typeof value.eventKey === 'string' &&
    typeof value.matchNumber === 'number' &&
    (value.predictedWinner === 'red' || value.predictedWinner === 'blue') &&
    typeof value.timestamp === 'number' &&
    typeof value.verified === 'boolean'
  );
};

export const handleScoutProfilesUpload = async (jsonData: unknown, mode: UploadMode): Promise<void> => {
  if (!jsonData || typeof jsonData !== 'object') {
    toast.error("Invalid scout profiles format");
    return;
  }

  const data = jsonData as { scouts?: unknown; predictions?: unknown };

  if (!Array.isArray(data.scouts) || !Array.isArray(data.predictions)) {
    toast.error("Invalid scout profiles format");
    return;
  }

  const scoutsToImport = data.scouts
    .map((scout) => normalizeTransferredScoutProfile(scout))
    .filter((scout): scout is Scout => !!scout);

  const predictionsToImport = data.predictions.filter(isValidPrediction);

  try {
    let scoutsAdded = 0;
    let scoutsUpdated = 0;
    let predictionsAdded = 0;

    if (mode === 'overwrite') {
      // Clear existing data
      await gameDB.scouts.clear();
      await gameDB.predictions.clear();

      // Add all new data
      await gameDB.scouts.bulkAdd(scoutsToImport);
      await gameDB.predictions.bulkAdd(predictionsToImport);

      scoutsAdded = scoutsToImport.length;
      predictionsAdded = predictionsToImport.length;
    } else {
      // Get existing data for smart merge/append
      const existingScouts = await gameDB.scouts.toArray();
      const existingPredictions = await gameDB.predictions.toArray();

      // Process scouts
      for (const scout of scoutsToImport) {
        const existing = existingScouts.find(s => s.name === scout.name);

        if (existing) {
          if (mode === 'smart-merge') {
            // Only update if new data is newer or has higher values
            const shouldUpdate =
              scout.lastUpdated > existing.lastUpdated ||
              scout.stakes > existing.stakes ||
              scout.totalPredictions > existing.totalPredictions;

            if (shouldUpdate) {
              await gameDB.scouts.update(scout.name, {
                stakes: Math.max(scout.stakes, existing.stakes),
                stakesFromPredictions: Math.max(
                  typeof scout.stakesFromPredictions === 'number' ? scout.stakesFromPredictions : 0,
                  typeof existing.stakesFromPredictions === 'number' ? existing.stakesFromPredictions : 0
                ),
                totalPredictions: Math.max(scout.totalPredictions, existing.totalPredictions),
                correctPredictions: Math.max(scout.correctPredictions, existing.correctPredictions),
                currentStreak: scout.lastUpdated > existing.lastUpdated ? scout.currentStreak : existing.currentStreak,
                longestStreak: Math.max(scout.longestStreak, existing.longestStreak),
                detailedCommentsCount: Math.max(
                  typeof scout.detailedCommentsCount === 'number' ? scout.detailedCommentsCount : 0,
                  typeof existing.detailedCommentsCount === 'number' ? existing.detailedCommentsCount : 0
                ),
                lastUpdated: Math.max(scout.lastUpdated, existing.lastUpdated)
              });
              scoutsUpdated++;
            }
          } else if (mode === 'append') {
            // Force update in append mode
            await gameDB.scouts.put(scout);
            scoutsUpdated++;
          }
        } else {
          // Add new scout
          await gameDB.scouts.add(scout);
          scoutsAdded++;
        }
      }

      // Process predictions
      for (const prediction of predictionsToImport) {
        const exists = existingPredictions.some(p => p.id === prediction.id);

        if (!exists) {
          try {
            await gameDB.predictions.add(prediction);
            predictionsAdded++;
          } catch {
            // Duplicate constraint, skip in smart merge
            if (mode === 'append') {
              console.warn(`Skipping duplicate prediction: ${prediction.id}`);
            }
          }
        }
      }
    }

    const message = mode === 'overwrite'
      ? `Overwritten with ${scoutsAdded} scouts and ${predictionsAdded} predictions`
      : `Profiles: ${scoutsAdded} new scouts, ${scoutsUpdated} updated scouts, ${predictionsAdded} predictions imported`;

    toast.success(message);
  } catch (error) {
    console.error('Error importing scout profiles:', error);
    toast.error("Failed to import scout profiles");
  }
};
