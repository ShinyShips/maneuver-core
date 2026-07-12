# Utilities app guide

The separate Utilities app owns operator setup. Scouts should receive a Maneuver join artifact and think in terms of joining a **Team dataset**, not configuring Firebase.

Open `/utilities.html` from the same build as the scouting app.

## Create a Team dataset

1. Verify the Backend card names the intended Firebase project.
2. Select **Connect**.
3. Enter a recognizable Dataset name, team number, and season.
4. Optionally enter an Event scope such as `2026miket`. This becomes a recommended device-local default; each device can review or change it during onboarding.
5. Select **Create dataset** once.

Creation produces three different artifacts:

| Artifact                                      | Intended holder          | Purpose                                                                      |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| Join artifact                                 | Ordinary scouts          | Reusable Dataset join credential plus dataset/backend identity               |
| Operator recovery artifact                    | Trusted operator storage | Cleanup credential and recovery metadata; never use it as a join artifact    |
| Device-specific cleanup provisioning artifact | One chosen joined device | Grants Cleanup-capable status to exactly the device ID named in the artifact |

Download the join and recovery artifacts immediately. Store the recovery artifact separately from ordinary scouting devices.

## Distribute the join artifact

The app shows the join artifact as QR, copyable JSON, and a downloadable JSON file. These are three representations of the same reusable credential. The current Remote sync onboarding page accepts pasted JSON or the downloaded file; use the QR only with a compatible artifact-scanning workflow.

- Share it only with the team members who should join this Team dataset.
- A copied artifact remains valid until its credential is rotated or revoked.
- Do not publish it in documentation, screenshots, source control, or a public chat.
- Never substitute the operator recovery artifact; the scouting app intentionally rejects it.

## Provision one Cleanup-capable device

1. Join the target scouting device normally.
2. On that device, open `/remote-sync` and copy the displayed device ID.
3. In Utilities, paste that ID into **Cleanup-capable device ID**.
4. Download **Cleanup device**.
5. Transfer that device-specific artifact privately to the target device.
6. On the target device, paste it into the cleanup provisioning control and confirm that the device becomes Cleanup capable.

Cleanup authority is distinct from lead mode and from the Dataset join credential. Provision only devices whose operators understand destructive cleanup and revocation.

## Credential rotation

Rotation invalidates the previous reusable join credential and produces a replacement. Existing joined devices remain joined; devices using the old artifact cannot newly join.

The Official admin interface exposes `rotateJoinCredential`, but the current Utilities screen does not present a rotation control and the local/dev Firebase adapter does not authenticate operator authority for that method. There is therefore no safe, operator-ready rotation procedure in the current release.

Do not work around this limitation with direct Firestore writes or a script that accepts only a join artifact. Rotation must be added to an authenticated operator/admin surface that can safely return and persist the replacement secret before revoking the old artifact. Until that surface exists, treat rotation as an unavailable administrative capability rather than implying a minimally technical operator can perform it.

For emergency broad invalidation, the server-local `resetDatasetForRejoinServerLocal` flow is stronger: it revokes active devices and join credentials and returns a replacement credential. Do not describe that operation as ordinary rotation.

## Operator/admin boundary

The browser Utilities screen currently supports initial dataset and artifact creation. Portable snapshots, Destructive restore, server-local revocation/reset, and server-local recovery review belong on a trusted server-local recovery surface. Do not add those controls to an ordinary joined-device page or grant them merely because a device has the join artifact.
