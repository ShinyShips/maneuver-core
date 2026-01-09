import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Progress } from "@/core/components/ui/progress";
import { ACHIEVEMENT_TIERS } from '@/game-template/gamification';
import type { Achievement } from '@/core/types/achievements';
import { Lock, Trophy } from 'lucide-react';

interface AchievementCardProps {
  achievement: Achievement;
  isUnlocked: boolean;
  progress?: number;
  unlockedAt?: number;
  showProgress?: boolean;
}

export const AchievementCard: React.FC<AchievementCardProps> = ({
  achievement,
  isUnlocked,
  progress = 0,
  unlockedAt,
  showProgress = true
}) => {
  const tierStyle = ACHIEVEMENT_TIERS[achievement.tier];

  return (
    <Card className={`relative transition-all duration-200 hover:shadow-md ${isUnlocked
        ? `${tierStyle.bgColor} ${tierStyle.borderColor} border-2`
        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
      }`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`text-2xl p-2 rounded-full ${isUnlocked ? tierStyle.bgColor : 'bg-gray-200 dark:bg-gray-800'
              }`}>
              {isUnlocked ? achievement.icon : <Lock className="h-5 w-5 text-gray-400" />}
            </div>
            <div>
              <CardTitle className={`text-lg ${isUnlocked ? tierStyle.textColor : 'text-gray-400 dark:text-gray-500'
                }`}>
                {achievement.name}
              </CardTitle>
              <Badge
                variant="secondary"
                className={`text-xs mt-1 ${isUnlocked ? tierStyle.textColor : 'text-gray-400'
                  }`}
                style={{
                  backgroundColor: isUnlocked ? tierStyle.color + '20' : undefined,
                  borderColor: isUnlocked ? tierStyle.color : undefined
                }}
              >
                {achievement.tier.toUpperCase()}
              </Badge>
            </div>
          </div>

          {isUnlocked && (
            <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <Trophy className="h-4 w-4" />
              <span className="text-sm font-medium">+{achievement.stakesReward}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p className={`text-sm mb-3 ${isUnlocked
            ? 'text-gray-700 dark:text-gray-300'
            : 'text-gray-500 dark:text-gray-400'
          }`}>
          {achievement.description}
        </p>

        {!isUnlocked && showProgress && progress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {isUnlocked && unlockedAt && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Unlocked {new Date(unlockedAt).toLocaleDateString()}
          </div>
        )}

        {!isUnlocked && progress === 0 && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <Lock className="h-3 w-3" />
            <span>Not started</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
