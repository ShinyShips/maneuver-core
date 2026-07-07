/**
 * Centralized Team Statistics Hook
 * 
 * This hook computes team statistics ONCE and caches the results.
 * All pages should use this instead of calculating their own stats.
 * 
 * Benefits:
 * - Calculations run once per team, not per component/page
 * - Results are memoized - only recalculates when match data changes
 * - All pages show consistent data
 * - Adding new stats means editing one file (calculations.ts)
 */

import { useEffect, useState } from "react";
import { getStrategySnapshots } from "@/core/lib/strategySnapshotCache";
import type { TeamStats } from "@/core/types/team-stats";

export interface UseAllTeamStatsResult {
    teamStats: TeamStats[];
    isLoading: boolean;
    error: Error | null;
}

/**
 * Central hook for all team statistics.
 * Computes stats ONCE per team and caches results.
 * 
 * @param eventKey - Optional event filter
 * @returns Array of TeamStats objects with all computed metrics
 */
export const useAllTeamStats = (eventKey?: string): UseAllTeamStatsResult => {
    const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isCancelled = false;

        const loadTeamStats = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const snapshots = await getStrategySnapshots(eventKey);
                const sortedSnapshots = [...snapshots].sort((a, b) => a.teamNumber - b.teamNumber);

                if (!isCancelled) {
                    setTeamStats(sortedSnapshots);
                }
            } catch (err) {
                if (!isCancelled) {
                    setError(err instanceof Error ? err : new Error("Failed to load team statistics"));
                    setTeamStats([]);
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        void loadTeamStats();

        return () => {
            isCancelled = true;
        };
    }, [eventKey]);

    return { teamStats, isLoading, error };
};
