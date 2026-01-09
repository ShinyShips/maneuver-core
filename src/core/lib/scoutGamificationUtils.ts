/**
 * Scout Gamification Wrapper
 * 
 * Re-exports gamification functionality from game-template for convenience.
 * This is a thin wrapper that adds achievement checking on top of core gamification.
 * 
 * NOTE: Gamification is OPTIONAL. If teams don't want to use it, they should
 * not import from this module or the game-template/gamification module.
 */

import type { Scout } from '@/game-template/gamification';
import type { Achievement } from './achievementTypes';
import {
  STAKE_VALUES,
  calculateStreakBonus,
  calculateAccuracy,
  getOrCreateScout,
  getScout,
  getAllScouts,
  updateScoutPoints,
  updateScoutStats,
  updateScoutWithPredictionResult,
  getLeaderboard,
  createMatchPrediction,
  getPredictionForMatch,
  getAllPredictionsForScout,
  getAllPredictionsForMatch,
  markPredictionAsVerified,
  deleteScout,
  clearGamificationData,
} from '@/game-template/gamification';
import { checkForNewAchievements } from './achievementUtils';

// Re-export stake values
export { STAKE_VALUES, calculateStreakBonus };

// Get or create a scout by name (linked to sidebar selection)
export const getOrCreateScoutByName = async (name: string): Promise<Scout> => {
  return await getOrCreateScout(name);
};

// Re-export accuracy calculation
export { calculateAccuracy };

// Re-export leaderboard
export { getLeaderboard };

// Wrapper function to update scout stats with achievement checking
export const updateScoutStatsWithAchievements = async (
  name: string,
  newStakes: number,
  correctPredictions: number,
  totalPredictions: number,
  currentStreak?: number,
  longestStreak?: number
): Promise<{ newAchievements: Achievement[] }> => {
  await updateScoutStats(name, newStakes, correctPredictions, totalPredictions, currentStreak, longestStreak);
  const newAchievements = await checkForNewAchievements(name);
  return { newAchievements };
};

// Wrapper function to update scout with prediction result and achievement checking
export const updateScoutWithPredictionAndAchievements = async (
  name: string,
  isCorrect: boolean,
  basePoints: number,
  eventKey: string,
  matchNumber: number
): Promise<{ newAchievements: Achievement[] }> => {
  await updateScoutWithPredictionResult(name, isCorrect, basePoints, eventKey, matchNumber);
  const newAchievements = await checkForNewAchievements(name);
  return { newAchievements };
};

// Re-export all gamification functions for convenience
export {
  getOrCreateScout,
  getScout,
  getAllScouts,
  updateScoutPoints,
  updateScoutStats,
  updateScoutWithPredictionResult,
  createMatchPrediction,
  getPredictionForMatch,
  getAllPredictionsForScout,
  getAllPredictionsForMatch,
  markPredictionAsVerified,
  deleteScout,
  clearGamificationData as clearGameData,
};

// Export Scout type for convenience
export type { Scout };
