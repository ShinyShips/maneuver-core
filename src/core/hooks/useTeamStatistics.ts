/**
 * Team Statistics Hook for Strategy Overview Page
 * 
 * This hook wraps useAllTeamStats and applies Strategy Overview-specific
 * filtering and column visibility logic.
 * 
 * NOTE: This hook NO LONGER calculates stats directly. All calculations
 * are done in game-template/calculations.ts via useAllTeamStats.
 */

import { useMemo } from "react";
import { useAllTeamStats } from "./useAllTeamStats";
import { StrategyConfig, ColumnFilter, TeamData, AggregationType } from "@/core/types/strategy";

export interface UseTeamStatisticsResult {
    teamStats: TeamData[];
    filteredTeamStats: TeamData[];
    isLoading: boolean;
    error: Error | null;
}

export const useTeamStatistics = (
    eventKey: string | undefined,
    config: StrategyConfig,
    columnFilters: Record<string, ColumnFilter>,
    aggregationType: AggregationType = 'average'
): UseTeamStatisticsResult => {
    // Get centralized team stats
    const { teamStats: allTeamStats, isLoading, error } = useAllTeamStats(eventKey);

    // Convert TeamStats to TeamData format (for backwards compatibility)
    const teamStats = useMemo(() => {
        return allTeamStats.map(stats => {
            const teamData: TeamData = {
                teamNumber: stats.teamNumber,
                eventKey: stats.eventKey,
                matchCount: stats.matchCount,
            };

            // Map all stats to the TeamData object
            // This allows the existing table/chart code to work without changes
            config.columns.forEach(col => {
                if (["teamNumber", "eventKey", "matchCount"].includes(col.key)) return;

                // Get value from stats using dot notation
                const value = getValueByPath(stats, col.key, aggregationType);
                if (value !== undefined) {
                    teamData[col.key] = value;
                }
            });

            return teamData;
        });
    }, [allTeamStats, config.columns, aggregationType]);

    // Apply column filters
    const filteredTeamStats = useMemo(() => {
        if (Object.keys(columnFilters).length === 0) return teamStats;

        return teamStats.filter(team => {
            return Object.entries(columnFilters).every(([key, filter]) => {
                const val = team[key];
                if (typeof val !== 'number') return true;

                switch (filter.operator) {
                    case ">": return val > filter.value;
                    case ">=": return val >= filter.value;
                    case "<": return val < filter.value;
                    case "<=": return val <= filter.value;
                    case "=": return Math.abs(val - filter.value) < 0.001;
                    case "!=": return Math.abs(val - filter.value) >= 0.001;
                    case "between":
                        return filter.value2 !== undefined
                            ? val >= filter.value && val <= filter.value2
                            : true;
                    default: return true;
                }
            });
        });
    }, [teamStats, columnFilters]);

    return { teamStats, filteredTeamStats, isLoading, error };
};

/**
 * Helper to get nested value from object using dot notation
 * If the value is an array (like rawValues), aggregate it based on the aggregationType
 */
function getValueByPath(obj: any, path: string, aggregationType: AggregationType = 'average'): any {
    if (!obj) return undefined;

    // Direct match
    if (obj[path] !== undefined) {
        const value = obj[path];
        return Array.isArray(value) ? aggregateArray(value, aggregationType) : value;
    }

    // Dot notation
    if (path.includes('.')) {
        const value = path.split('.').reduce((o, key) => o?.[key], obj);
        return Array.isArray(value) ? aggregateArray(value, aggregationType) : value;
    }

    return undefined;
}

/**
 * Aggregate an array of numbers based on aggregation type
 */
function aggregateArray(values: number[], type: AggregationType): number {
    if (values.length === 0) return 0;

    switch (type) {
        case 'average': {
            const sum = values.reduce((acc, val) => acc + val, 0);
            return sum / values.length;
        }
        case 'max': {
            return Math.max(...values);
        }
        case 'min': {
            return Math.min(...values);
        }
        case 'p75': {
            const sorted = [...values].sort((a, b) => a - b);
            const index = Math.ceil(sorted.length * 0.75) - 1;
            return sorted[index] ?? 0;
        }
        case 'p25': {
            const sorted = [...values].sort((a, b) => a - b);
            const index = Math.ceil(sorted.length * 0.25) - 1;
            return sorted[index] ?? 0;
        }
        case 'median': {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
                ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
                : sorted[mid] ?? 0;
        }
        case 'sum': {
            return values.reduce((acc, val) => acc + val, 0);
        }
        default:
            return 0;
    }
}
