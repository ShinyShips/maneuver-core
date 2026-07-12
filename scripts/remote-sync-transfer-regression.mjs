import assert from 'node:assert/strict';
import { createServer } from 'vite';
import {
  installBrowserTestEnvironment,
  MemoryStorage,
} from './remote-sync-test-browser-env.mjs';

const localStorage = new MemoryStorage();
installBrowserTestEnvironment(localStorage, { platform: 'CoreTransferRegression' });

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'error',
  root: process.cwd(),
  optimizeDeps: { noDiscovery: true },
  resolve: {
    alias: {
      '@': new URL('../src', import.meta.url).pathname,
    },
  },
  server: { middlewareMode: true },
});

try {
  const {
    createRemoteSyncConnection,
    loadRemoteSyncConnection,
    saveRemoteSyncConnection,
  } = await vite.ssrLoadModule('/src/core/sync/remoteSyncConnection.ts');
  const {
    compressData,
    convertToUint8Array,
    createCompressionWrapper,
    decompressData,
  } = await vite.ssrLoadModule('/src/core/lib/compressionUtils.ts');
  const { buildCompactPacketJson, parseScannedFountainPacket } = await vite.ssrLoadModule(
    '/src/core/lib/fountainPacket.ts'
  );
  const { fromUint8Array, toUint8Array } = await import('js-base64');
  const { binaryToBlock, blockToBinary, createDecoder, createEncoder } = await import(
    'luby-transform'
  );

  saveRemoteSyncConnection(
    createRemoteSyncConnection(
      {
        protocolVersion: 1,
        backend: 'firebase',
        datasetId: 'transfer-regression-dataset',
        datasetName: 'Transfer regression dataset',
        credentialId: 'join-credential',
        credentialSecret: 'join-secret',
        firebase: { projectId: 'transfer-regression-project' },
        recommendedDefaults: { queueMode: 'local-first' },
      },
      { deviceDisplayName: 'Transfer regression device' }
    )
  );
  assert.equal(
    loadRemoteSyncConnection()?.datasetId,
    'transfer-regression-dataset',
    'the regression runs while Remote sync is configured'
  );

  const offlineTransfer = {
    entries: [
      {
        id: '2026miket::qm1::3314::red',
        eventKey: '2026miket',
        matchKey: 'qm1',
        teamNumber: 3314,
        scoutName: 'Scout A',
        gameData: { auto: 1 },
      },
    ],
    exportedAt: 1_000,
    version: '1.0',
  };
  const compressed = compressData(offlineTransfer);
  const wrapper = createCompressionWrapper(true, compressed, fromUint8Array);
  const restoredOfflineTransfer = decompressData(
    convertToUint8Array(wrapper.data, toUint8Array, 'offline transfer')
  );
  assert.deepEqual(
    restoredOfflineTransfer,
    offlineTransfer,
    'Offline transfer payloads still round-trip while Remote sync is configured'
  );

  const qrPayload = buildCompactPacketJson({
    type: 'scouting_fountain_packet',
    sessionId: 'remote-sync-coexistence',
    packetId: 7,
    totalPackets: 12,
    profile: 'fast',
    data: wrapper.data,
  });
  assert.deepEqual(
    parseScannedFountainPacket(qrPayload),
    {
      type: 'scouting_fountain_packet',
      sessionId: 'remote-sync-coexistence',
      packetId: 7,
      totalPackets: 12,
      profile: 'fast',
      data: wrapper.data,
    },
    'QR transfer packets still preserve their public wire contract while Remote sync is configured'
  );

  const encoder = createEncoder(compressed, 64);
  const decoder = createDecoder();
  const fountain = encoder.fountain()[Symbol.iterator]();
  let decoded;
  for (let packetId = 0; packetId < 1_000 && !decoded; packetId += 1) {
    const nextBlock = fountain.next();
    assert.equal(nextBlock.done, false, 'QR fountain encoder continues until recovery completes');
    const packet = parseScannedFountainPacket(
      buildCompactPacketJson({
        type: 'scouting_fountain_packet',
        sessionId: 'remote-sync-fountain-outcome',
        packetId,
        profile: 'fast',
        data: fromUint8Array(blockToBinary(nextBlock.value)),
      })
    );
    assert.ok(packet, 'QR scanner accepts a generated fountain packet');
    const complete = decoder.addBlock(binaryToBlock(toUint8Array(packet.data)));
    if (complete) {
      decoded = decompressData(decoder.getDecoded());
    }
  }
  assert.deepEqual(
    decoded,
    offlineTransfer,
    'QR generator and scanner transport reconstruct the complete Offline transfer payload alongside Remote sync'
  );

  console.log('Core transfer regression passed with optional Remote sync configured.');
} finally {
  await vite.close();
}
