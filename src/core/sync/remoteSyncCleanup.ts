import type {
  CanonicalDocumentTarget,
  CanonicalDocumentType,
  DatasetCleanupProvisioningArtifact,
} from './types';

const CANONICAL_DOCUMENT_TYPES = new Set<CanonicalDocumentType>([
  'match-scouting-entry',
  'pit-scouting-entry',
  'scout-profile',
]);

export type ParseCleanupProvisioningArtifactResult =
  | { ok: true; artifact: DatasetCleanupProvisioningArtifact }
  | { ok: false; error: string };

export function parseDatasetCleanupProvisioningArtifact(
  rawArtifact: string
): ParseCleanupProvisioningArtifactResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawArtifact);
  } catch {
    return { ok: false, error: 'Cleanup provisioning artifact must be valid JSON.' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Cleanup provisioning artifact must be a JSON object.' };
  }
  if ('credentialId' in parsed || 'credentialSecret' in parsed) {
    return { ok: false, error: 'Dataset join artifacts cannot grant cleanup authority.' };
  }
  if (parsed.protocolVersion !== 1 || parsed.backend !== 'firebase') {
    return { ok: false, error: 'Cleanup provisioning artifact is not supported.' };
  }
  if (!isNonEmptyString(parsed.datasetId) || !isNonEmptyString(parsed.datasetName)) {
    return { ok: false, error: 'Cleanup provisioning artifact is missing dataset identity.' };
  }
  if (
    !isNonEmptyString(parsed.cleanupCredentialId) ||
    !isNonEmptyString(parsed.cleanupCredentialSecret)
  ) {
    return { ok: false, error: 'Cleanup provisioning artifact is missing Cleanup credential data.' };
  }
  if (!isNonEmptyString(parsed.provisionedDeviceId)) {
    return { ok: false, error: 'Cleanup provisioning artifact is missing its target device.' };
  }
  if (
    'cleanupCredentialExpiresAt' in parsed &&
    typeof parsed.cleanupCredentialExpiresAt !== 'number'
  ) {
    return { ok: false, error: 'Cleanup provisioning artifact has an invalid expiry.' };
  }
  if (!isRecord(parsed.firebase) || !isNonEmptyString(parsed.firebase.projectId)) {
    return { ok: false, error: 'Cleanup provisioning artifact is missing Firebase project data.' };
  }

  return { ok: true, artifact: parsed as unknown as DatasetCleanupProvisioningArtifact };
}

export function parseCleanupDocumentTargets(rawTargets: string): CanonicalDocumentTarget[] {
  const targets = rawTargets
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separatorIndex = line.indexOf('|');
      const documentType = line.slice(0, separatorIndex).trim() as CanonicalDocumentType;
      const documentId = line.slice(separatorIndex + 1).trim();

      if (
        separatorIndex < 1 ||
        !CANONICAL_DOCUMENT_TYPES.has(documentType) ||
        !documentId
      ) {
        throw new Error(
          `Invalid cleanup target "${line}". Use document-type|document-id.`
        );
      }
      return { documentType, documentId };
    });

  return [...new Map(targets.map(target => [
    `${target.documentType}:${target.documentId}`,
    target,
  ])).values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
