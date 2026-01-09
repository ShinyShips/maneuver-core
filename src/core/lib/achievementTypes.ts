// Core Achievement Logic and Helper Functions
import type { Scout } from '@/game-template/gamification';
import {
  Achievement,
  AchievementTierStyles,
  AchievementRequirement,
  AchievementCategory
} from '@/core/types/achievements';

// Helper functions for achievement checking
export const checkAchievement = (achievement: Achievement, scout: Scout): boolean => {
  const { requirements } = achievement;

  switch (requirements.type) {
    case 'minimum':
      if (requirements.property && requirements.property in scout) {
        return (scout[requirements.property as keyof Scout] as number) >= requirements.value;
      }
      return false;

    case 'exact':
      if (requirements.property && requirements.property in scout) {
        return (scout[requirements.property as keyof Scout] as number) === requirements.value;
      }
      return false;

    case 'percentage':
      if (requirements.property && requirements.property in scout) {
        const value = scout[requirements.property as keyof Scout] as number;
        const total = scout.totalPredictions;
        return total > 0 && (value / total * 100) >= requirements.value;
      }
      return false;

    case 'custom':
      return requirements.customCheck ? requirements.customCheck(scout) : false;

    case 'special':
      // Special achievements need custom logic in the achievement system
      return false;

    default:
      return false;
  }
};

export const getAchievementProgress = (achievement: Achievement, scout: Scout): number => {
  const { requirements } = achievement;

  switch (requirements.type) {
    case 'minimum':
    case 'exact':
      if (requirements.property && requirements.property in scout) {
        const current = scout[requirements.property as keyof Scout] as number;
        return Math.min(100, (current / requirements.value) * 100);
      }
      return 0;

    case 'percentage':
      if (requirements.property && requirements.property in scout) {
        const value = scout[requirements.property as keyof Scout] as number;
        const total = scout.totalPredictions;
        if (total === 0) return 0;
        const currentPercentage = (value / total) * 100;
        return Math.min(100, (currentPercentage / requirements.value) * 100);
      }
      return 0;

    case 'custom':
      // Custom achievements can define their own progress calculation
      if (checkAchievement(achievement, scout)) return 100;
      // For custom achievements, we'll need specific progress logic
      return 0;

    default:
      return 0;
  }
};

// Get achievements grouped by category
export const getAchievementsByCategory = (definitions: Achievement[]): { [key: string]: Achievement[] } => {
  const categories: { [key: string]: Achievement[] } = {};

  for (const achievement of definitions) {
    if (!categories[achievement.category]) {
      categories[achievement.category] = [];
    }
    categories[achievement.category]?.push(achievement);
  }

  return categories;
};

// Export styles type for convenience
export type { AchievementTierStyles };
export type { Achievement, AchievementCategory, AchievementRequirement };
