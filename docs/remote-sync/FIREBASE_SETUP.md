# Firebase-backed Remote sync setup

This is the recommended backend path for the current Official sync protocol implementation. It connects both the scouting app and the separate Utilities app to one Cloud Firestore project.

## Security status

The checked-in [`firestore.rules`](../../firestore.rules) are a **local/dev harness**. They intentionally allow unauthenticated access to ordinary dataset collections so the emulator and adapter contract can run, while protecting cleanup secrets and portable snapshots.

Do not expose those rules as a production security boundary. Before an internet-accessible deployment, bind joined-device and operator operations to authenticated device claims and restrict dataset access accordingly. The current rules file says the same in its inline comments. Treat a project using the rules unchanged as local development or a controlled pilot with non-sensitive data, not a secure public service.

## 1. Create the Firebase project

1. In the [Firebase console](https://console.firebase.google.com/), create or select a project owned by the team.
2. Add a Web app. Firebase displays the web configuration values after registration.
3. Create a Cloud Firestore database in Native mode and choose the region deliberately; moving regions later is not a routine operation.
4. Record the Web app values. Firebase Web API keys identify the project and are not Cleanup credentials, but the project configuration still belongs in deployment configuration rather than source control.

The adapter reads:

```dotenv
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-web-app-id
```

`VITE_FIREBASE_PROJECT_ID` is the only value required by the current configuration parser. Supply the complete Web app configuration for a hosted deployment.

## 2. Configure the repository

Create `.env.local` in the repository root with the values above. Do not commit `.env.local`, join artifacts, Cleanup credentials, or operator recovery artifacts.

Install and verify the app:

```bash
npm install
npm run typecheck
npm run build
```

The production build contains two entry points:

- `index.html` — the normal scouting app
- `utilities.html` — the operator-facing Utilities app

Deploy both entry points from the same build. Restrict access to `utilities.html` at the hosting layer when possible; it is an operator surface, not a scout landing page.

## 3. Configure Firestore

The repository contains [`firebase.json`](../../firebase.json), [`firestore.indexes.json`](../../firestore.indexes.json), and [`firestore.rules`](../../firestore.rules). The index supports cursor-ordered `document_changes` queries.

For local development, use the files unchanged with the emulator. For any hosted deployment, complete the authenticated-rules work described above before deploying rules. Once production-safe rules exist for the deployment:

```bash
npx firebase login
npx firebase use --add
npx firebase deploy --only firestore:rules,firestore:indexes
```

## 4. Connect Utilities

1. Start or deploy the app with the Firebase environment variables present at build time.
2. Open `/utilities.html`.
3. Confirm the Backend card shows the intended project and `Hosted` rather than `Missing`.
4. Select **Connect**. Do not create a Team dataset until the status says the configured Firebase backend is connected.
5. Continue with [the Utilities app guide](UTILITIES_APP.md).

## Troubleshooting

- **Project shows Missing:** `VITE_FIREBASE_PROJECT_ID` was absent when Vite started or built the app. Restart after changing `.env.local`.
- **Utilities connects to the emulator unexpectedly:** remove `VITE_FIREBASE_FIRESTORE_EMULATOR_HOST` and `VITE_FIREBASE_FIRESTORE_EMULATOR_PORT` from the hosted environment.
- **Cursor queries request an index:** deploy `firestore.indexes.json` to the same project.
- **Permission denied:** verify the deployed rules and authentication model; do not “fix” production by making dataset collections public.
