/**
 * Data Filtering Utilities
 * Reduces large event data transfers from 74-190 QR codes to <40 codes
 */

import type { ScoutingDataExport } from '../types/scouting-entry';

/**
 * Type alias for data collections used in filtering
 */
export type ScoutingDataCollection = ScoutingDataExport;

// Filtering interfaces
export interface MatchRangeFilter {
  type: 'preset' | 'custom';
  preset?: 'last10' | 'last15' | 'last30' | 'all' | 'fromLastExport';
  customStart?: number;
  customEnd?: number;
  customStartKey?: string;
  customEndKey?: string;
}

export interface TeamFilter {
  selectedTeams: string[]; // Team numbers as strings
  includeAll: boolean;
}

export interface EventFilter {
  selectedEvents: string[];
  includeAll: boolean;
}

export interface ScoutFilter {
  selectedScouts: string[];
  includeAll: boolean;
}

export interface DataFilters {
  matchRange: MatchRangeFilter;
  events: EventFilter;
  teams: TeamFilter;
  scouts: ScoutFilter;
}

export interface FilteredDataStats {
  originalEntries: number;
  filteredEntries: number;
  estimatedQRCodes: number;
  compressionReduction?: string;
  scanTimeEstimate: string;
  warningLevel: 'safe' | 'warning' | 'danger';
}

interface ParsedMatchIdentity {
  compOrder: number;
  setNumber: number;
  matchNumber: number;
  normalizedKey: string;
}

export interface TransferMatchOption {
  key: string;
  label: string;
  index: number;
}

/**
 * Track the last exported match for "from last export" filtering
 */
const LAST_EXPORTED_MATCH_KEY = 'maneuver_last_exported_match';

export function getLastExportedMatch(): number | null {
  try {
    const stored = localStorage.getItem(LAST_EXPORTED_MATCH_KEY);
    return stored ? parseInt(stored) : null;
  } catch {
    return null;
  }
}

export function setLastExportedMatch(matchNumber: number): void {
  try {
    localStorage.setItem(LAST_EXPORTED_MATCH_KEY, matchNumber.toString());
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Extract unique team numbers from scouting data
 */
export function extractTeamNumbers(data: ScoutingDataCollection): string[] {
  const teams = new Set<string>();

  data.entries.forEach(entry => {
    if (entry.teamNumber) {
      teams.add(String(entry.teamNumber));
    }
  });

  return Array.from(teams).sort((a, b) => {
    // Sort numerically if both are numbers, otherwise alphabetically
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });
}

/**
 * Extract unique event keys from scouting data
 */
export function extractEventKeys(data: ScoutingDataCollection): string[] {
  const events = new Set<string>();

  data.entries.forEach(entry => {
    if (entry.eventKey && String(entry.eventKey).trim() !== '') {
      events.add(String(entry.eventKey));
    }
  });

  return Array.from(events).sort((a, b) => a.localeCompare(b));
}

export function extractScoutNames<T extends { name?: string }>(scouts: T[]): string[] {
  const names = new Set<string>();

  scouts.forEach(scout => {
    if (scout.name && scout.name.trim() !== '') {
      names.add(scout.name.trim());
    }
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function filterPitScoutingEntries<T extends { teamNumber?: number | string; eventKey?: string; scoutName?: string }>(
  entries: T[],
  filters: DataFilters
): T[] {
  const eventFilter = filters.events ?? { selectedEvents: [], includeAll: true };
  const teamFilter = filters.teams ?? { selectedTeams: [], includeAll: true };
  const scoutFilter = filters.scouts ?? { selectedScouts: [], includeAll: true };

  return entries.filter(entry => {
    if (!eventFilter.includeAll && eventFilter.selectedEvents.length > 0) {
      if (!eventFilter.selectedEvents.includes(String(entry.eventKey || ''))) {
        return false;
      }
    }

    if (!teamFilter.includeAll && teamFilter.selectedTeams.length > 0) {
      if (!teamFilter.selectedTeams.includes(String(entry.teamNumber || ''))) {
        return false;
      }
    }

    if (!scoutFilter.includeAll && scoutFilter.selectedScouts.length > 0) {
      if (!scoutFilter.selectedScouts.includes(String(entry.scoutName || '').trim())) {
        return false;
      }
    }

    return true;
  });
}

export function filterScoutProfilePayload<
  TScout extends { name?: string },
  TPrediction extends { scoutName?: string },
  TAchievement extends { scoutName?: string }
>(
  payload: {
    scouts: TScout[];
    predictions?: TPrediction[];
    achievements?: TAchievement[];
  },
  filters: DataFilters
): {
  scouts: TScout[];
  predictions: TPrediction[];
  achievements: TAchievement[];
} {
  const scoutFilter = filters.scouts ?? { selectedScouts: [], includeAll: true };

  if (scoutFilter.includeAll || scoutFilter.selectedScouts.length === 0) {
    return {
      scouts: payload.scouts,
      predictions: payload.predictions ?? [],
      achievements: payload.achievements ?? []
    };
  }

  const allowedScouts = new Set(scoutFilter.selectedScouts.map(name => name.trim()));

  return {
    scouts: payload.scouts.filter(scout => allowedScouts.has(String(scout.name || '').trim())),
    predictions: (payload.predictions ?? []).filter(prediction => allowedScouts.has(String(prediction.scoutName || '').trim())),
    achievements: (payload.achievements ?? []).filter(achievement => allowedScouts.has(String(achievement.scoutName || '').trim()))
  };
}

function parseMatchIdentity(matchKey: string | undefined, fallbackMatchNumber: number | undefined): ParsedMatchIdentity {
  const normalizedKey = String(matchKey || '').trim();

  if (normalizedKey.startsWith('qm')) {
    const matchNumber = parseInt(normalizedKey.slice(2), 10) || fallbackMatchNumber || 0;
    return {
      compOrder: 1,
      setNumber: 1,
      matchNumber,
      normalizedKey: normalizedKey || `qm${matchNumber}`
    };
  }

  const semifinalMatch = normalizedKey.match(/^sf(\d+)m(\d+)$/);
  if (semifinalMatch && semifinalMatch[1] && semifinalMatch[2]) {
    return {
      compOrder: 2,
      setNumber: parseInt(semifinalMatch[1], 10),
      matchNumber: parseInt(semifinalMatch[2], 10),
      normalizedKey
    };
  }

  const finalMatch = normalizedKey.match(/^f(\d+)m(\d+)$/);
  if (finalMatch && finalMatch[1] && finalMatch[2]) {
    return {
      compOrder: 3,
      setNumber: parseInt(finalMatch[1], 10),
      matchNumber: parseInt(finalMatch[2], 10),
      normalizedKey
    };
  }

  const fallback = fallbackMatchNumber || 0;
  return {
    compOrder: 4,
    setNumber: 1,
    matchNumber: fallback,
    normalizedKey: normalizedKey || `match-${fallback}`
  };
}

function compareMatchIdentities(a: ParsedMatchIdentity, b: ParsedMatchIdentity): number {
  if (a.compOrder !== b.compOrder) {
    return a.compOrder - b.compOrder;
  }

  if (a.setNumber !== b.setNumber) {
    return a.setNumber - b.setNumber;
  }

  if (a.matchNumber !== b.matchNumber) {
    return a.matchNumber - b.matchNumber;
  }

  return a.normalizedKey.localeCompare(b.normalizedKey);
}

function getSortedUniqueMatchKeys(entries: ScoutingDataCollection['entries']): string[] {
  const identities = new Map<string, ParsedMatchIdentity>();

  entries.forEach(entry => {
    const identity = parseMatchIdentity(entry.matchKey, entry.matchNumber);
    identities.set(identity.normalizedKey, identity);
  });

  return Array.from(identities.values())
    .sort(compareMatchIdentities)
    .map(identity => identity.normalizedKey);
}

export function formatTransferMatchLabel(matchKey: string): string {
  const identity = parseMatchIdentity(matchKey, undefined);

  switch (identity.compOrder) {
    case 1:
      return `Qual ${identity.matchNumber}`;
    case 2:
      return `SF ${identity.setNumber}-${identity.matchNumber}`;
    case 3:
      return `Final ${identity.matchNumber}`;
    default:
      return matchKey;
  }
}

export function extractMatchOptions(data: ScoutingDataCollection): TransferMatchOption[] {
  return getSortedUniqueMatchKeys(data.entries).map((matchKey, index) => ({
    key: matchKey,
    label: formatTransferMatchLabel(matchKey),
    index: index + 1
  }));
}

export function extractMatchCount(data: ScoutingDataCollection): number {
  return getSortedUniqueMatchKeys(data.entries).length;
}

/**
 * Extract match number range from scouting data
 */
export function extractMatchRange(data: ScoutingDataCollection): { min: number; max: number } {
  const matchCount = extractMatchCount(data);

  return {
    min: 1,
    max: matchCount > 0 ? matchCount : 1
  };
}

/**
 * Apply filters to scouting data
 */
export function applyFilters(
  data: ScoutingDataCollection,
  filters: DataFilters
): ScoutingDataCollection {
  let filteredEntries = data.entries;
  const eventFilter = filters.events ?? { selectedEvents: [], includeAll: true };

  // Apply event filter
  if (!eventFilter.includeAll && eventFilter.selectedEvents.length > 0) {
    filteredEntries = filteredEntries.filter(entry =>
      eventFilter.selectedEvents.includes(String(entry.eventKey || ''))
    );
  }

  // Apply team filter
  if (!filters.teams.includeAll && filters.teams.selectedTeams.length > 0) {
    filteredEntries = filteredEntries.filter(entry =>
      filters.teams.selectedTeams.includes(String(entry.teamNumber))
    );
  }

  const orderedMatchKeys = getSortedUniqueMatchKeys(filteredEntries);

  // Apply match range filter
  if (filters.matchRange.type === 'preset' && filters.matchRange.preset !== 'all') {
    let startIndex = 0;

    if (filters.matchRange.preset === 'last10') {
      startIndex = Math.max(0, orderedMatchKeys.length - 10);
    } else if (filters.matchRange.preset === 'last15') {
      startIndex = Math.max(0, orderedMatchKeys.length - 15);
    } else if (filters.matchRange.preset === 'last30') {
      startIndex = Math.max(0, orderedMatchKeys.length - 30);
    } else if (filters.matchRange.preset === 'fromLastExport') {
      const lastExportedMatch = getLastExportedMatch();
      startIndex = lastExportedMatch ? Math.max(0, lastExportedMatch) : 0;
    }

    const selectedMatchKeys = new Set(orderedMatchKeys.slice(startIndex));

    filteredEntries = filteredEntries.filter(entry =>
      selectedMatchKeys.has(parseMatchIdentity(entry.matchKey, entry.matchNumber).normalizedKey)
    );
  } else if (filters.matchRange.type === 'custom') {
    const startIndexFromKey = filters.matchRange.customStartKey
      ? orderedMatchKeys.indexOf(filters.matchRange.customStartKey)
      : -1;
    const endIndexFromKey = filters.matchRange.customEndKey
      ? orderedMatchKeys.indexOf(filters.matchRange.customEndKey)
      : -1;

    const fallbackStart = Math.max(0, (filters.matchRange.customStart || 1) - 1);
    const fallbackEnd = Math.max(0, (filters.matchRange.customEnd || orderedMatchKeys.length) - 1);

    const startIndex = startIndexFromKey >= 0 ? startIndexFromKey : fallbackStart;
    const endIndex = endIndexFromKey >= 0 ? endIndexFromKey : fallbackEnd;
    const rangeStart = Math.min(startIndex, endIndex);
    const rangeEnd = Math.max(startIndex, endIndex);
    const selectedMatchKeys = new Set(
      orderedMatchKeys.slice(rangeStart, rangeEnd + 1)
    );

    filteredEntries = filteredEntries.filter(entry =>
      selectedMatchKeys.has(parseMatchIdentity(entry.matchKey, entry.matchNumber).normalizedKey)
    );
  }

  return {
    ...data,
    entries: filteredEntries
  };
}

/**
 * Estimate QR codes and generate statistics for filtered data
 */
export function calculateFilterStats(
  originalData: ScoutingDataCollection,
  filteredData: ScoutingDataCollection,
  useCompression: boolean = true
): FilteredDataStats {
  const originalEntries = originalData.entries.length;
  const filteredEntries = filteredData.entries.length;

  // Estimate bytes per entry based on compression
  let bytesPerEntry: number;
  if (useCompression) {
    // Advanced compression achieves ~4.2 entries per QR code (2KB)
    bytesPerEntry = 2000 / 4.2; // ~476 bytes per entry after compression
  } else {
    // Standard JSON encoding ~2-3KB per entry
    bytesPerEntry = 2500;
  }

  const estimatedBytes = filteredEntries * bytesPerEntry;
  const estimatedQRCodes = Math.ceil(estimatedBytes / 2000); // 2KB per QR code

  // Calculate scan time estimate (assuming ~3 seconds per QR code)
  const scanTimeSeconds = estimatedQRCodes * 3;
  const scanTimeMinutes = Math.floor(scanTimeSeconds / 60);
  const remainingSeconds = scanTimeSeconds % 60;

  let scanTimeEstimate: string;
  if (scanTimeMinutes > 0) {
    scanTimeEstimate = `~${scanTimeMinutes}m ${remainingSeconds}s`;
  } else {
    scanTimeEstimate = `~${scanTimeSeconds}s`;
  }

  // Determine warning level
  let warningLevel: 'safe' | 'warning' | 'danger';
  if (estimatedQRCodes <= 20) {
    warningLevel = 'safe';
  } else if (estimatedQRCodes <= 40) {
    warningLevel = 'warning';
  } else {
    warningLevel = 'danger';
  }

  // Compression reduction info
  let compressionReduction: string | undefined;
  if (useCompression && originalEntries > 0) {
    const originalQRs = Math.ceil((originalEntries * 2500) / 2000); // Uncompressed estimate
    const compressedQRs = Math.ceil((originalEntries * bytesPerEntry) / 2000);
    const reduction = ((originalQRs - compressedQRs) / originalQRs * 100).toFixed(1);
    compressionReduction = `${reduction}% fewer codes with compression`;
  }

  return {
    originalEntries,
    filteredEntries,
    estimatedQRCodes,
    compressionReduction,
    scanTimeEstimate,
    warningLevel
  };
}

/**
 * Create default filters (smart default based on export history)
 */
export function createDefaultFilters(): DataFilters {
  const lastExported = getLastExportedMatch();
  const defaultPreset = lastExported !== null ? 'fromLastExport' : 'all';

  return {
    matchRange: {
      type: 'preset',
      preset: defaultPreset
    },
    events: {
      selectedEvents: [],
      includeAll: true
    },
    teams: {
      selectedTeams: [],
      includeAll: true
    },
    scouts: {
      selectedScouts: [],
      includeAll: true
    }
  };
}

/**
 * Validate filter configuration
 */
export function validateFilters(filters: DataFilters): { valid: boolean; error?: string } {
  if (filters.matchRange.type === 'custom') {
    if (filters.matchRange.customStartKey && filters.matchRange.customEndKey
      && filters.matchRange.customStartKey === filters.matchRange.customEndKey) {
      return { valid: true };
    }

    const start = filters.matchRange.customStart;
    const end = filters.matchRange.customEnd;

    if (start !== undefined && end !== undefined && start > end) {
      return { valid: false, error: 'Start match must be less than or equal to end match' };
    }

    if (start !== undefined && (start < 1 || start > 200)) {
      return { valid: false, error: 'Start match must be between 1 and 200' };
    }

    if (end !== undefined && (end < 1 || end > 200)) {
      return { valid: false, error: 'End match must be between 1 and 200' };
    }
  }

  return { valid: true };
}
