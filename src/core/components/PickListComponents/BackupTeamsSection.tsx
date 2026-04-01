/**
 * Backup Teams Section Component
 * 
 * Section for managing backup teams.
 * Matches 2025 styling.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { GenericSelector } from "@/core/components/ui/generic-selector";
import { TeamStatsDialog } from "@/game-template/pick-list-config";
import { Trash2 } from "lucide-react";
import type { BackupTeam } from "@/core/lib/allianceTypes";
import type { TeamStats } from "@/core/types/team-stats";

interface BackupTeamsSectionProps {
    backups: BackupTeam[];
    availableTeams: TeamStats[];
    teamLookupTeams: TeamStats[];
    selectedTeams: number[];
    onUpdateBackups: (backups: BackupTeam[]) => void;
}

export const BackupTeamsSection = ({
    backups,
    availableTeams,
    teamLookupTeams,
    selectedTeams,
    onUpdateBackups
}: BackupTeamsSectionProps) => {
    const [backupSelectValue, setBackupSelectValue] = useState("placeholder");

    const getAvailableTeamsForSelection = () => {
        return availableTeams.filter(team => !selectedTeams.includes(team.teamNumber));
    };

    const addToBackups = (value: string) => {
        if (value === "placeholder" || !value) return;
        const teamNumber = Number(value);

        const newBackup: BackupTeam = {
            teamNumber,
            rank: backups.length + 1
        };
        onUpdateBackups([...backups, newBackup]);
        setBackupSelectValue("placeholder");
    };

    const removeFromBackups = (teamNumber: number) => {
        const updatedBackups = backups.filter(b => b.teamNumber !== teamNumber);
        const renumberedBackups = updatedBackups.map((backup, index) => ({
            ...backup,
            rank: index + 1
        }));
        onUpdateBackups(renumberedBackups);
    };

    const getTeamStatsObject = (teamNumber: number): TeamStats | undefined => {
        return teamLookupTeams.find(t => t.teamNumber === teamNumber);
    };

    const getBackupTeamOptions = () => {
        const available = getAvailableTeamsForSelection();
        return ["placeholder", ...available.map(team => String(team.teamNumber))];
    };

    const getBackupTeamDisplayFormat = (value: string) => {
        if (value === "placeholder") return "Select a team...";
        return value;
    };

    const availableForSelection = getAvailableTeamsForSelection();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Backup Teams</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Add to backups */}
                    <div className="flex items-center gap-4">
                        <GenericSelector
                            label="Add Backup Team"
                            value={backupSelectValue}
                            availableOptions={getBackupTeamOptions()}
                            onValueChange={(value) => {
                                setBackupSelectValue(value);
                                addToBackups(value);
                            }}
                            placeholder="Add backup team"
                            displayFormat={getBackupTeamDisplayFormat}
                            className="w-48"
                        />
                        <span className="text-sm text-muted-foreground">
                            {availableForSelection.length} teams available
                        </span>
                    </div>

                    {/* Backup teams list */}
                    {backups.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {backups.map((backup) => {
                                const teamStats = getTeamStatsObject(backup.teamNumber);
                                return (
                                    <Card key={backup.teamNumber} className="p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary">{backup.rank}</Badge>
                                                    <span className="font-medium">Team {backup.teamNumber}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <TeamStatsDialog
                                                    teamNumber={backup.teamNumber}
                                                    teamStats={teamStats}
                                                    className="h-auto"
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => removeFromBackups(backup.teamNumber)}
                                                    className="text-red-400 hover:text-red-500"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {backups.length === 0 && (
                        <div className="text-center py-6 text-muted-foreground">
                            No backup teams selected
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
