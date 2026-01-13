import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Button } from '@/core/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { MatchValidationResult } from '@/core/lib/matchValidationTypes';

interface TeamBreakdownProps {
  teams: NonNullable<MatchValidationResult['teams']>;
  onRescoutTeam: (teamNumber: string, alliance: 'red' | 'blue') => void;
}

export const TeamBreakdown: React.FC<TeamBreakdownProps> = ({
  teams,
  onRescoutTeam,
}) => {
  if (!teams || teams.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {teams.map((team) => (
            <div
              key={team.teamNumber}
              className="border rounded-lg p-4 space-y-3"
            >
              {/* Team Header - wraps to 2 lines on mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* Team info */}
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant="outline"
                    className={`shrink-0 ${team.alliance === 'red' ? 'bg-red-100 dark:bg-red-950' : 'bg-blue-100 dark:bg-blue-950'}`}
                  >
                    {team.teamNumber}
                  </Badge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span className="truncate">{team.hasScoutedData ? team.scoutName : 'No Data'}</span>
                      {team.isCorrected && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 shrink-0">
                          Corrected
                        </Badge>
                      )}
                    </div>
                    {team.notes.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {team.notes.join(', ')}
                      </div>
                    )}
                    {team.isCorrected && team.correctionCount && team.correctionCount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {team.correctionCount} {team.correctionCount === 1 ? 'correction' : 'corrections'}
                        {team.lastCorrectedBy && ` by ${team.lastCorrectedBy}`}
                        {team.lastCorrectedAt && ` • ${new Date(team.lastCorrectedAt).toLocaleString()}`}
                      </div>
                    )}
                    {team.correctionNotes && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 italic mt-1">
                        Note: {team.correctionNotes}
                      </div>
                    )}
                  </div>
                </div>
                {/* Action buttons - wrap on mobile */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {team.flagForReview && (
                    <Badge variant="destructive" className="text-xs">
                      Review
                    </Badge>
                  )}
                  <Badge variant={
                    team.confidence === 'high' ? 'default' :
                      team.confidence === 'medium' ? 'secondary' : 'destructive'
                  } className="text-xs">
                    {team.confidence}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRescoutTeam(team.teamNumber, team.alliance)}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Re-Scout
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
