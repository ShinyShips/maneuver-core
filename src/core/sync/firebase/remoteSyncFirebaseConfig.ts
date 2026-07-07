import type { FirebaseOptions } from 'firebase/app';
import type { RemoteSyncFirebaseProjectConfig } from '../types';

export interface FirebaseRemoteSyncEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_FIRESTORE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_FIRESTORE_EMULATOR_PORT?: string;
}

export interface FirebaseRemoteSyncConfig {
  firebase: RemoteSyncFirebaseProjectConfig;
  firestoreEmulator?: {
    host: string;
    port: number;
  };
}

export function isFirebaseRemoteSyncConfigured(
  env: FirebaseRemoteSyncEnv = getDefaultEnv()
): boolean {
  return Boolean(env.VITE_FIREBASE_PROJECT_ID);
}

export function getFirebaseRemoteSyncConfigFromEnv(
  env: FirebaseRemoteSyncEnv = getDefaultEnv()
): FirebaseRemoteSyncConfig | null {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;

  if (!projectId) {
    return null;
  }

  const firebase: FirebaseOptions & RemoteSyncFirebaseProjectConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || 'local-dev-api-key',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID || `maneuver-${projectId}`,
  };

  const emulatorPort = Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT);
  const firestoreEmulator =
    env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST && Number.isFinite(emulatorPort)
      ? {
          host: env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST,
          port: emulatorPort,
        }
      : undefined;

  return {
    firebase,
    firestoreEmulator,
  };
}

function getDefaultEnv(): FirebaseRemoteSyncEnv {
  return (import.meta.env ?? {}) as FirebaseRemoteSyncEnv;
}
