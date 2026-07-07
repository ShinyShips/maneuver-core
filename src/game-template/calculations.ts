/**
 * Centralized Team Statistics Calculations
 * 
 * This is the SINGLE SOURCE OF TRUTH for all team stat calculations.
 * All pages (Strategy Overview, Match Strategy, etc.) should use this
 * via the useAllTeamStats hook instead of calculating their own stats.
 * 
 * YEAR-AGNOSTIC: Uses generic gameData fields (action1Count, action2Count, etc.)
 * instead of game-specific names. Customize the mapping in your game-template.
 */

import type { ScoutingEntry } from "@/game-template/scoring";
import type { TeamStats } from "@/core/types/team-stats";
import { scoringCalculations } from "./scoring";

export interface ScoredMatchMetrics {
    autoPoints: number;
    teleopPoints: number;
    endgamePoints: number;
    totalPoints: number;
}

const isIncludedInStats = (match: ScoutingEntry): boolean => !match.ignoreForStats;

export const scoreMatchForStats = (match: ScoutingEntry): ScoredMatchMetrics => {
    const autoPoints = scoringCalculations.calculateAutoPoints({ gameData: match.gameData } as any);
    const teleopPoints = scoringCalculations.calculateTeleopPoints({ gameData: match.gameData } as any);
    const endgamePoints = scoringCalculations.calculateEndgamePoints({ gameData: match.gameData } as any);

    return {
        autoPoints,
        teleopPoints,
        endgamePoints,
        totalPoints: autoPoints + teleopPoints + endgamePoints,
    };
};

// Helper functions
const sum = <T>(arr: T[], fn: (item: T) => number): number =>
    arr.reduce((acc, item) => acc + fn(item), 0);

const round = (n: number, decimals: number = 1): number =>
    Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);

const percent = (count: number, total: number): number =>
    total > 0 ? Math.round((count / total) * 100) : 0;

const val = (n: number | undefined): number => n || 0;

/**
 * Calculate all statistics for a single team from their match entries.
 * Returns a complete TeamStats object with all metrics.
 */
export const calculateTeamStats = (teamMatches: ScoutingEntry[]): Omit<TeamStats, 'teamNumber' | 'eventKey'> => {
    if (teamMatches.length === 0) {
        return getEmptyStats();
    }

    const includedMatches = teamMatches.filter(isIncludedInStats);
    const matchCount = includedMatches.length;

    const scoredMatches = teamMatches.map(match => ({
        match,
        scores: scoreMatchForStats(match),
    }));

    const includedScoredMatches = scoredMatches.filter(({ match }) => isIncludedInStats(match));

    if (matchCount === 0) {
        return {
            ...getEmptyStats(),
            rawValues: {
                totalPoints: [],
                autoPoints: [],
                teleopPoints: [],
                endgamePoints: [],
            },
        };
    }

    // ============================================================================
    // POINT CALCULATIONS (using centralized scoring)
    // ============================================================================

    const totalAutoPoints = sum(includedScoredMatches, ({ scores }) => scores.autoPoints);
    const totalTeleopPoints = sum(includedScoredMatches, ({ scores }) => scores.teleopPoints);
    const totalEndgamePoints = sum(includedScoredMatches, ({ scores }) => scores.endgamePoints);
    const totalPoints = totalAutoPoints + totalTeleopPoints + totalEndgamePoints;

    // ============================================================================
    // GAME PIECE CALCULATIONS (Generic: action1 = game piece type 1, action2 = type 2)
    // ============================================================================

    // Auto game pieces
    const autoGamePiece1Total = sum(includedMatches, m =>
        val(m.gameData?.auto?.action1Count) + val(m.gameData?.auto?.action2Count)
    );

    const autoGamePiece2Total = sum(includedMatches, m =>
        val(m.gameData?.auto?.action3Count) + val(m.gameData?.auto?.action4Count)
    );

    // Teleop game pieces
    const teleopGamePiece1Total = sum(includedMatches, m =>
        val(m.gameData?.teleop?.action1Count) + val(m.gameData?.teleop?.action2Count)
    );

    const teleopGamePiece2Total = sum(includedMatches, m =>
        val(m.gameData?.teleop?.action3Count)
    );

    // Total game pieces
    const totalGamePiece1 = autoGamePiece1Total + teleopGamePiece1Total;
    const totalGamePiece2 = autoGamePiece2Total + teleopGamePiece2Total;
    const totalPieces = totalGamePiece1 + totalGamePiece2;

    // ============================================================================
    // AUTO PHASE STATS
    // ============================================================================

    // Mobility indicator (using autoToggle from schema)
    const mobilityCount = includedMatches.filter(m => m.gameData?.auto?.autoToggle === true).length;

    // Starting positions
    const startPositions = calculateStartPositions(includedMatches, matchCount);

    // ============================================================================
    // ENDGAME STATS (Generic: option1-5, toggle1-2 as boolean flags)
    // ============================================================================

    // Calculate rates for all endgame boolean options
    const option1Count = includedMatches.filter(m => m.gameData?.endgame?.option1 === true).length;
    const option2Count = includedMatches.filter(m => m.gameData?.endgame?.option2 === true).length;
    const option3Count = includedMatches.filter(m => m.gameData?.endgame?.option3 === true).length;
    const option4Count = includedMatches.filter(m => m.gameData?.endgame?.option4 === true).length;
    const option5Count = includedMatches.filter(m => m.gameData?.endgame?.option5 === true).length;
    const toggle1Count = includedMatches.filter(m => m.gameData?.endgame?.toggle1 === true).length;
    const toggle2Count = includedMatches.filter(m => m.gameData?.endgame?.toggle2 === true).length;

    // ============================================================================
    // RAW VALUES (for box plots and distribution charts)
    // ============================================================================

    const rawValues = {
        totalPoints: includedScoredMatches.map(({ scores }) => scores.totalPoints),
        autoPoints: includedScoredMatches.map(({ scores }) => scores.autoPoints),
        teleopPoints: includedScoredMatches.map(({ scores }) => scores.teleopPoints),
        endgamePoints: includedScoredMatches.map(({ scores }) => scores.endgamePoints),
    };

    // ============================================================================
    // RETURN COMPLETE STATS OBJECT
    // ============================================================================

    return {
        matchCount,

        // Aggregate scores
        totalPoints: round(totalPoints / matchCount),
        autoPoints: round(totalAutoPoints / matchCount),
        teleopPoints: round(totalTeleopPoints / matchCount),
        endgamePoints: round(totalEndgamePoints / matchCount),

        // Overall phase
        overall: {
            avgTotalPoints: round(totalPoints / matchCount),
            totalPiecesScored: round(totalPieces / matchCount),
            avgGamePiece1: round(totalGamePiece1 / matchCount),  // Generic game piece type 1
            avgGamePiece2: round(totalGamePiece2 / matchCount),  // Generic game piece type 2
        },

        // Auto phase
        auto: {
            avgPoints: round(totalAutoPoints / matchCount),
            avgGamePiece1: round(autoGamePiece1Total / matchCount),
            avgGamePiece2: round(autoGamePiece2Total / matchCount),
            mobilityRate: percent(mobilityCount, matchCount),
            startPositions,
        },

        // Teleop phase
        teleop: {
            avgPoints: round(totalTeleopPoints / matchCount),
            avgGamePiece1: round(teleopGamePiece1Total / matchCount),
            avgGamePiece2: round(teleopGamePiece2Total / matchCount),
        },

        // Endgame phase - rates for all boolean options
        endgame: {
            avgPoints: round(totalEndgamePoints / matchCount),
            // Option rates (percentage of matches where true)
            option1Rate: percent(option1Count, matchCount),
            option2Rate: percent(option2Count, matchCount),
            option3Rate: percent(option3Count, matchCount),
            option4Rate: percent(option4Count, matchCount),
            option5Rate: percent(option5Count, matchCount),
            // Toggle rates
            toggle1Rate: percent(toggle1Count, matchCount),
            toggle2Rate: percent(toggle2Count, matchCount),
            // Legacy aliases for backward compatibility
            climbRate: percent(option1Count, matchCount),
            parkRate: percent(option2Count, matchCount),
            shallowClimbRate: percent(option3Count, matchCount),
            deepClimbRate: percent(option4Count, matchCount),
        },

        // Raw values for charts
        rawValues,
    };
};

/**
 * Calculate starting position distribution
 */
function calculateStartPositions(
    teamMatches: ScoutingEntry[],
    matchCount: number
): Array<{ position: string; percentage: number }> {
    // Count occurrences of each start position (0-5)
    const positionCounts: Record<number, number> = {};

    teamMatches.forEach(m => {
        const pos = m.gameData?.auto?.startPosition;
        if (typeof pos === 'number' && pos >= 0 && pos <= 5) {
            positionCounts[pos] = (positionCounts[pos] || 0) + 1;
        }
    });

    // Convert to array with percentages
    const result: Array<{ position: string; percentage: number }> = [];
    for (let i = 0; i <= 5; i++) {
        const count = positionCounts[i] || 0;
        const percentage = percent(count, matchCount);
        if (percentage > 0) {
            result.push({ position: `Pos ${i}`, percentage });
        }
    }

    return result;
}

/**
 * Return empty stats object (for teams with no data)
 */
function getEmptyStats(): Omit<TeamStats, 'teamNumber' | 'eventKey'> {
    return {
        matchCount: 0,
        totalPoints: 0,
        autoPoints: 0,
        teleopPoints: 0,
        endgamePoints: 0,
        overall: {
            avgTotalPoints: 0,
            totalPiecesScored: 0,
            avgGamePiece1: 0,
            avgGamePiece2: 0,
        },
        auto: {
            avgPoints: 0,
            avgGamePiece1: 0,
            avgGamePiece2: 0,
            mobilityRate: 0,
            startPositions: [],
        },
        teleop: {
            avgPoints: 0,
            avgGamePiece1: 0,
            avgGamePiece2: 0,
        },
        endgame: {
            avgPoints: 0,
            climbRate: 0,
            parkRate: 0,
            shallowClimbRate: 0,
            deepClimbRate: 0,
        },
        rawValues: {
            totalPoints: [],
            autoPoints: [],
            teleopPoints: [],
            endgamePoints: [],
        },
    };
}
