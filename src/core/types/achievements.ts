// Universal Achievement System Types
import type { Scout } from '@/core/types/gamification';

export type AchievementCategory =
    | 'accuracy'
    | 'volume'
    | 'streaks'
    | 'special'
    | 'social'
    | 'time'
    | 'improvement';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface AchievementRequirement {
    type: 'exact' | 'minimum' | 'percentage' | 'streak' | 'special' | 'custom';
    value: number;
    property?: keyof Scout | 'custom';
    customCheck?: (scout: Scout) => boolean;
}

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: AchievementCategory;
    tier: AchievementTier;
    requirements: AchievementRequirement;
    stakesReward: number;
    hidden?: boolean; // Hidden until unlocked
}

export interface ScoutAchievement {
    scoutName: string;
    achievementId: string;
    unlockedAt: number;
    progress?: number; // For tracking progress toward achievement
}

export interface AchievementTierStyle {
    color: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
}

export type AchievementTierStyles = Record<AchievementTier, AchievementTierStyle>;
