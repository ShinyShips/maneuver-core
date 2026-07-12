import type { PitScoutingEntryBase } from '@/core/types/pit-scouting';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import type { CanonicalDocumentType } from './types';

export interface CanonicalDocumentIdentity {
  documentType: CanonicalDocumentType;
  documentId: string;
  scopeKey?: string;
}

export type CanonicalDocumentIdentityInput =
  | {
      documentType: 'match-scouting-entry';
      payload: Pick<ScoutingEntryBase, 'id' | 'eventKey'>;
    }
  | {
      documentType: 'pit-scouting-entry';
      payload: Pick<PitScoutingEntryBase, 'teamNumber' | 'eventKey'>;
    }
  | {
      documentType: 'scout-profile';
      scoutName: string;
    };

export type ScoutNameCollisionInspection =
  | {
      status: 'available';
      normalizedName: string;
    }
  | {
      status: 'collision';
      normalizedName: string;
      existingName: string;
    };

export function createCanonicalDocumentIdentity(
  input: CanonicalDocumentIdentityInput
): CanonicalDocumentIdentity {
  switch (input.documentType) {
    case 'match-scouting-entry': {
      const documentId = input.payload.id.trim();
      const scopeKey = normalizeEventKey(input.payload.eventKey);

      if (!documentId) {
        throw new Error('Match scouting entry identity requires a record id.');
      }

      return {
        documentType: input.documentType,
        documentId,
        scopeKey,
      };
    }
    case 'pit-scouting-entry': {
      const scopeKey = normalizeEventKey(input.payload.eventKey);
      const teamNumber = input.payload.teamNumber;

      if (!Number.isSafeInteger(teamNumber) || teamNumber <= 0) {
        throw new Error('Pit scouting entry identity requires a positive team number.');
      }

      return {
        documentType: input.documentType,
        documentId: `${scopeKey}:${teamNumber}`,
        scopeKey,
      };
    }
    case 'scout-profile':
      return {
        documentType: input.documentType,
        documentId: normalizeScoutProfileName(input.scoutName),
      };
  }
}

export function createCanonicalDocumentKey(documentType: string, documentId: string): string {
  return `${documentType}:${documentId}`;
}

export function normalizeScoutProfileName(name: string): string {
  const normalizedName = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

  if (!normalizedName) {
    throw new Error('Scout profile identity requires a Scout name.');
  }

  return normalizedName;
}

export function inspectScoutNameCollision(
  existingProfileNames: Iterable<string>,
  requestedName: string
): ScoutNameCollisionInspection {
  const normalizedName = normalizeScoutProfileName(requestedName);
  const existingName = Array.from(existingProfileNames).find(
    name => normalizeScoutProfileName(name) === normalizedName
  );

  return existingName
    ? {
        status: 'collision',
        normalizedName,
        existingName,
      }
    : {
        status: 'available',
        normalizedName,
      };
}

function normalizeEventKey(eventKey: string): string {
  const normalizedEventKey = eventKey.trim().toLowerCase();

  if (!normalizedEventKey) {
    throw new Error('Canonical document identity requires an Event key.');
  }

  return normalizedEventKey;
}
