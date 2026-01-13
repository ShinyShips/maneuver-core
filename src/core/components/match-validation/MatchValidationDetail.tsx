import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/core/components/ui/sheet';
import { Button } from '@/core/components/ui/button';
import { Card, CardContent } from '@/core/components/ui/card';
import { Alert, AlertDescription } from '@/core/components/ui/alert';
import { StatusBadge } from './StatusBadge';
import { AllianceCard } from './AllianceCard';
import { MatchSummaryCard } from './MatchSummaryCard';
import { DiscrepancyList } from './DiscrepancyList';
import { TeamBreakdown } from './TeamBreakdown';
import { RefreshCw, Users, ExternalLink, AlertTriangle, Info } from 'lucide-react';
import type { MatchListItem, Discrepancy } from '@/core/lib/matchValidationTypes';

interface MatchValidationDetailProps {
  match: MatchListItem;
  isOpen: boolean;
  onClose: () => void;
  onReValidate?: () => void;
  formatMatchLabel?: (match: { matchNumber: string; compLevel?: string; setNumber?: number }) => string;
}

export const MatchValidationDetail: React.FC<MatchValidationDetailProps> = ({
  match,
  isOpen,
  onClose,
  onReValidate,
  formatMatchLabel,
}) => {
  const navigate = useNavigate();
  const validationResult = match.validationResult;
  const matchLabel = formatMatchLabel
    ? formatMatchLabel({ ...match, matchNumber: match.matchNumber.toString() })
    : match.displayName;

  // Generate TBA match URL
  const getTBAMatchUrl = () => {
    if (!match.matchKey) return null;
    return `https://www.thebluealliance.com/match/${match.matchKey}`;
  };

  // Handler to re-scout a single team
  const handleRescoutTeam = (teamNumber: string, alliance: 'red' | 'blue') => {
    navigate('/game-start', {
      state: {
        rescout: {
          isRescout: true,
          matchNumber: match.matchNumber.toString(),
          teamNumber: teamNumber,
          alliance: alliance,
          eventKey: match.matchKey.split('_')[0]
        }
      }
    });
  };

  // Handler to re-scout entire alliance
  const handleRescoutAlliance = (alliance: 'red' | 'blue') => {
    const teams = validationResult?.teams
      ?.filter(t => t.alliance === alliance)
      .map(t => t.teamNumber) || [];

    if (teams.length === 0) {
      console.warn('No teams found for alliance:', alliance);
      return;
    }

    const rescoutState = {
      isRescout: true,
      matchNumber: match.matchNumber.toString(),
      alliance: alliance,
      eventKey: match.matchKey.split('_')[0],
      teams: teams,
      currentTeamIndex: 0
    };

    navigate('/game-start', {
      state: {
        rescout: rescoutState
      }
    });
  };

  // Get severity badge variant
  const getSeverityVariant = (severity: Discrepancy['severity']) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'default';
      case 'minor':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Sort all discrepancies by severity (only if validation result exists)
  const allDiscrepancies = validationResult ? [
    ...validationResult.redAlliance.discrepancies.map(d => ({ ...d, alliance: 'red' as const })),
    ...validationResult.blueAlliance.discrepancies.map(d => ({ ...d, alliance: 'blue' as const }))
  ].sort((a, b) => {
    // Sort by severity (critical > warning > minor)
    const severityOrder = { critical: 0, warning: 1, minor: 2, none: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  }) : [];

  // Determine status for display
  const displayStatus = validationResult?.status ?? (match.hasScouting ? 'pending' : 'no-scouting');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-4">
        <SheetHeader className='pt-4 px-0 pb-0'>
          <SheetTitle className="flex flex-col gap-3 py-4">
            {/* Match title and status */}
            <div className="flex items-center gap-3">
              <span>{matchLabel}</span>
              <StatusBadge status={displayStatus} />
            </div>
            {/* Action buttons - stack on mobile */}
            <div className="flex flex-wrap items-center gap-2">
              {getTBAMatchUrl() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(getTBAMatchUrl()!, '_blank')}
                  className='p-4'
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in TBA
                </Button>
              )}
              {onReValidate && validationResult && (
                <Button variant="outline" size="sm" onClick={onReValidate} className='p-4'>
                  <RefreshCw className="h-4 w-4" />
                  Re-validate
                </Button>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Show validation results if available */}
          {validationResult ? (
            <>
              {/* Match Summary */}
              <MatchSummaryCard match={validationResult} />

              {/* Alliance Comparison */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Alliance Comparison
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AllianceCard
                    allianceValidation={validationResult.redAlliance}
                    onRescoutAlliance={handleRescoutAlliance}
                  />
                  <AllianceCard
                    allianceValidation={validationResult.blueAlliance}
                    onRescoutAlliance={handleRescoutAlliance}
                  />
                </div>
              </div>

              {/* Detailed Discrepancies */}
              <DiscrepancyList
                discrepancies={allDiscrepancies}
                getSeverityVariant={getSeverityVariant}
              />

              {/* Team Breakdown */}
              <TeamBreakdown
                teams={validationResult.teams || []}
                onRescoutTeam={handleRescoutTeam}
              />

              {/* Metadata */}
              <div className="text-xs text-muted-foreground text-center pb-4">
                Validated: {new Date(validationResult.validatedAt).toLocaleString()}
                {validationResult.validatedBy && ` • By: ${validationResult.validatedBy}`}
              </div>
            </>
          ) : (
            <>
              {/* TBA-Only View for Unscouted Matches */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {match.hasScouting
                    ? 'This match has scouting data but has not been validated yet. Click "Validate Event" on the main page to run validation.'
                    : 'This match has not been scouted yet. TBA data is shown below.'}
                </AlertDescription>
              </Alert>

              {/* TBA Score Display */}
              {match.hasTBAResults && match.redScore !== undefined && match.blueScore !== undefined ? (
                <>
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold mb-4">TBA Match Results</h3>

                      {/* Score Comparison */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* Red Alliance */}
                        <div className="border-2 border-red-300 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-950/30">
                          <div className="text-sm text-red-700 dark:text-red-300 font-medium mb-2">Red Alliance</div>
                          <div className="text-3xl font-bold text-red-900 dark:text-red-100 mb-2">{match.redScore}</div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {match.redTeams.map(team => (
                              <div key={team}>{team}</div>
                            ))}
                          </div>
                          {match.redAutoScore !== undefined && match.redTeleopScore !== undefined && (
                            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800 text-xs space-y-1">
                              <div className="flex justify-between">
                                <span>Auto:</span>
                                <span className="font-medium">{match.redAutoScore}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Teleop:</span>
                                <span className="font-medium">{match.redTeleopScore}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Blue Alliance */}
                        <div className="border-2 border-blue-300 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
                          <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-2">Blue Alliance</div>
                          <div className="text-3xl font-bold text-blue-900 dark:text-blue-100 mb-2">{match.blueScore}</div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {match.blueTeams.map(team => (
                              <div key={team}>{team}</div>
                            ))}
                          </div>
                          {match.blueAutoScore !== undefined && match.blueTeleopScore !== undefined && (
                            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 text-xs space-y-1">
                              <div className="flex justify-between">
                                <span>Auto:</span>
                                <span className="font-medium">{match.blueAutoScore}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Teleop:</span>
                                <span className="font-medium">{match.blueTeleopScore}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Match Info */}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Scouting Status:</span>
                          <span className="font-medium">
                            {match.scoutingComplete ? 'Complete' : match.hasScouting ? `Partial (${match.redTeamsScouted + match.blueTeamsScouted}/6 teams)` : 'Not Scouted'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action to start scouting */}
                  {!match.hasScouting && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        To validate this match, scout all 6 teams using the Game Start page.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Match:</span>
                        <span className="font-medium">{matchLabel}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">TBA Results:</span>
                        <span className="font-medium">Not Available</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Red Alliance:</span>
                        <span className="font-medium">{match.redTeams.join(', ')}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Blue Alliance:</span>
                        <span className="font-medium">{match.blueTeams.join(', ')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
