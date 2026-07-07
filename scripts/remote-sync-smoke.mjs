import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  terminate,
} from 'firebase/firestore';

const useEmulator = process.argv.includes('--emulator');
const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  (useEmulator ? 'maneuver-dev' : undefined);
const emulatorHost =
  process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST ||
  process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ||
  (useEmulator ? '127.0.0.1' : undefined);
const emulatorPort = Number(
  process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ||
    process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ||
    8080
);

if (!projectId) {
  throw new Error(
    'Set VITE_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID before running the Remote sync smoke check.'
  );
}

const app = initializeApp({
  projectId,
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'local-dev-api-key',
  appId: process.env.VITE_FIREBASE_APP_ID || `maneuver-${projectId}`,
});
const firestore = getFirestore(app);

if (emulatorHost) {
  connectFirestoreEmulator(firestore, emulatorHost, emulatorPort);
}

const smokeId = `remote-sync-smoke-${Date.now()}`;
const smokeRef = doc(firestore, 'datasets', smokeId);

await setDoc(smokeRef, {
  datasetId: smokeId,
  displayName: 'Remote sync smoke dataset',
  createdAt: Date.now(),
  createdByDeviceId: 'smoke-script',
});

const snapshot = await getDoc(smokeRef);

if (!snapshot.exists()) {
  throw new Error('Remote sync smoke write did not round-trip through Firestore.');
}

await deleteDoc(smokeRef);
await terminate(firestore);
await deleteApp(app);

console.log(`Remote sync Firebase smoke check passed for project ${projectId}.`);
