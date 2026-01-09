/**
 * Game-Specific Data Transformation
 * 
 * Transforms action arrays from match scouting into counter fields for database storage.
 * 
 * DERIVED FROM: game-schema.ts
 * All action types and toggle names come from the schema.
 */

import type { DataTransformation } from "@/types/game-interfaces";
import { toggles, getActionKeys, getActionPoints, type ActionKey } from "./game-schema";

/**
 * Generate default values for all action counters
 */
function generateActionDefaults(phase: 'auto' | 'teleop'): Record<string, number> {
  const defaults: Record<string, number> = {};
  getActionKeys().forEach(key => {
    // Only verify points for the specific phase using getActionPoints
    if (getActionPoints(key, phase) > 0) {
      defaults[`${key}Count`] = 0;
    }
  });
  return defaults;
}

/**
 * Generate default values for toggle fields
 */
function generateToggleDefaults(phase: 'auto' | 'teleop' | 'endgame'): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  const phaseToggles = toggles[phase];
  Object.keys(phaseToggles).forEach(key => {
    defaults[key] = false;
  });
  return defaults;
}

export const gameDataTransformation: DataTransformation = {
  transformActionsToCounters(matchData) {
    // Extract start position
    const selectedPosition = matchData.startPosition?.findIndex((pos: boolean) => pos === true);
    const startPosition = selectedPosition !== undefined && selectedPosition >= 0
      ? selectedPosition
      : null;

    // Initialize with schema-derived defaults
    const result: Record<string, any> = {
      auto: {
        startPosition,
        ...generateActionDefaults('auto'),
        ...generateToggleDefaults('auto'),
      },
      teleop: {
        ...generateActionDefaults('teleop'),
        ...generateToggleDefaults('teleop'),
      },
      endgame: {
        ...generateToggleDefaults('endgame'),
      },
    };

    // Count actions from action arrays
    // Action types are derived from schema keys
    const actionKeys = getActionKeys();

    matchData.autoActions?.forEach((action: any) => {
      const actionType = action.actionType as ActionKey;
      if (actionKeys.includes(actionType) && getActionPoints(actionType, 'auto') > 0) {
        const countKey = `${actionType}Count`;
        result.auto[countKey] = (result.auto[countKey] || 0) + 1;
      }
    });

    matchData.teleopActions?.forEach((action: any) => {
      const actionType = action.actionType as ActionKey;
      if (actionKeys.includes(actionType) && getActionPoints(actionType, 'teleop') > 0) {
        const countKey = `${actionType}Count`;
        result.teleop[countKey] = (result.teleop[countKey] || 0) + 1;
      }
    });

    // Copy robot status flags (from StatusToggles component)
    if (matchData.autoRobotStatus) Object.assign(result.auto, matchData.autoRobotStatus);
    if (matchData.teleopRobotStatus) Object.assign(result.teleop, matchData.teleopRobotStatus);
    if (matchData.endgameRobotStatus) Object.assign(result.endgame, matchData.endgameRobotStatus);

    // Copy any additional fields
    const additionalFields = { ...matchData };
    delete additionalFields.autoActions;
    delete additionalFields.teleopActions;
    delete additionalFields.autoRobotStatus;
    delete additionalFields.teleopRobotStatus;
    delete additionalFields.endgameRobotStatus;
    delete additionalFields.startPosition;

    Object.assign(result, additionalFields);

    return result;
  }
};

export default gameDataTransformation;
