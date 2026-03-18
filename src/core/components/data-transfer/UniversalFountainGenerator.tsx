/**
 * Universal QR Fountain Code Generator
 * Framework component - game-agnostic
 * 
 * Generates multiple QR codes using Luby Transform fountain codes for reliable data transfer.
 * Supports auto-cycling, playback controls, and smart compression.
 */

import { useState, useEffect, useRef, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/core/components/ui/alert";
import { Badge } from "@/core/components/ui/badge";
import { toast } from "sonner";
import { createEncoder, blockToBinary } from "luby-transform";
import { fromUint8Array } from "js-base64";
import { Info, Play, Pause, SkipForward, SkipBack, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  shouldUseCompression,
  getCompressionStats,
  compressData,
  MIN_FOUNTAIN_SIZE_COMPRESSED,
  MIN_FOUNTAIN_SIZE_UNCOMPRESSED,
  QR_CODE_SIZE_BYTES
} from "@/core/lib/compressionUtils";
import { getFountainEstimate, type FountainProfile } from "@/core/lib/fountainUtils";
import { buildCompactPacketJson, buildLegacyPacketJson } from "@/core/lib/fountainPacket";

interface FountainPacket {
  type: string;
  sessionId: string;
  packetId: number;
  totalPackets?: number;
  data: string; // Base64 encoded binary data
  qrPayload: string;
  profile: FountainProfile;
  k?: number;
  bytes?: number;
  checksum?: string;
  indices?: number[];
}

type PacketDraft = Omit<FountainPacket, 'qrPayload' | 'totalPackets'>;
type EncodedBlock = Parameters<typeof blockToBinary>[0];

interface FountainGenerationSession {
  iterator: Iterator<EncodedBlock>;
  sessionId: string;
  seenIndicesCombinations: Set<string>;
  nextPacketId: number;
  profile: FountainProfile;
  additionalBatchSize: number;
}

export interface UniversalFountainGeneratorProps {
  onBack: () => void;
  onSwitchToScanner?: () => void;
  dataType: string;
  loadData: () => Promise<unknown> | unknown;
  compressData?: (data: unknown, originalJson?: string) => Uint8Array;
  title: string;
  description: string;
  noDataMessage: string;
  settingsContent?: ReactNode;
}

type GenerationMode = 'normal' | 'stuck-simulation';

export const UniversalFountainGenerator = ({
  onBack,
  onSwitchToScanner,
  dataType,
  loadData,
  compressData: customCompress,
  title,
  description,
  noDataMessage,
  settingsContent
}: UniversalFountainGeneratorProps) => {
  const [packets, setPackets] = useState<FountainPacket[]>([]);
  const [currentPacketIndex, setCurrentPacketIndex] = useState(0);
  const [data, setData] = useState<unknown>(null);
  const [cycleSpeed, setCycleSpeed] = useState(500);
  const [compressionInfo, setCompressionInfo] = useState<string>('');
  const [isPaused, setIsPaused] = useState(false);
  const [jumpToPacket, setJumpToPacket] = useState<string>('');
  const [fountainProfile, setFountainProfile] = useState<FountainProfile>('fast');
  const packetDraftsRef = useRef<PacketDraft[]>([]);
  const generationSessionRef = useRef<FountainGenerationSession | null>(null);

  // Speed presets
  const speedPresets = [
    { label: "Default (2/sec)", value: 500 },
    { label: "Slower (1/sec)", value: 1000 }
  ];

  const profilePresets: Array<{ label: string; value: FountainProfile; description: string }> = [
    { label: "Fast", value: 'fast', description: "Fewer scans, lower redundancy" },
    { label: "Reliable", value: 'reliable', description: "More scans, higher redundancy" }
  ];

  // Load data on mount
  useEffect(() => {
    const loadDataAsync = async () => {
      try {
        const loadedData = await loadData();
        setData(loadedData);

        if (import.meta.env.DEV) {
          if (loadedData) {
            console.log(`Loaded ${dataType} data for fountain codes:`, loadedData);
          } else {
            console.log(`No ${dataType} data found`);
          }
        }
      } catch (error) {
        console.error(`Error loading ${dataType} data:`, error);
        toast.error(`Error loading ${dataType} data: ` + (error instanceof Error ? error.message : String(error)));
        setData(null);
      }
    };

    loadDataAsync();
  }, [loadData, dataType]);

  const buildPacketSet = (drafts: PacketDraft[], profile: FountainProfile) => {
    let candidateDrafts = drafts;
    let generatedPackets: FountainPacket[] = [];

    for (let pass = 0; pass < 3; pass++) {
      const candidateTotal = candidateDrafts.length;
      const nextDrafts: PacketDraft[] = [];
      const nextPackets: FountainPacket[] = [];

      candidateDrafts.forEach((draft, index) => {
        const normalizedDraft: PacketDraft = {
          ...draft,
          packetId: index
        };

        const packetJson = profile === 'reliable'
          ? buildLegacyPacketJson({
            type: normalizedDraft.type,
            sessionId: normalizedDraft.sessionId,
            packetId: normalizedDraft.packetId,
            totalPackets: candidateTotal,
            data: normalizedDraft.data,
            k: normalizedDraft.k ?? 0,
            bytes: normalizedDraft.bytes ?? 0,
            checksum: normalizedDraft.checksum ?? '',
            indices: normalizedDraft.indices ?? []
          })
          : buildCompactPacketJson({
            type: normalizedDraft.type,
            sessionId: normalizedDraft.sessionId,
            packetId: normalizedDraft.packetId,
            totalPackets: candidateTotal,
            profile: normalizedDraft.profile,
            data: normalizedDraft.data
          });

        if (packetJson.length > (QR_CODE_SIZE_BYTES * 0.9)) {
          console.warn(`📦 Packet ${normalizedDraft.packetId} too large (${packetJson.length} chars), skipping`);
          return;
        }

        nextDrafts.push(normalizedDraft);
        nextPackets.push({
          ...normalizedDraft,
          totalPackets: candidateTotal,
          qrPayload: packetJson
        });
      });

      generatedPackets = nextPackets;

      if (nextDrafts.length === candidateDrafts.length) {
        break;
      }

      candidateDrafts = nextDrafts;
    }

    return {
      drafts: candidateDrafts,
      packets: generatedPackets
    };
  };

  const collectAdditionalPacketDrafts = (session: FountainGenerationSession, count: number) => {
    const nextDrafts = [...packetDraftsRef.current];
    let generatedCount = 0;
    let attempts = 0;
    const maxAttempts = Math.max(count * 20, count + 20);

    while (generatedCount < count && attempts < maxAttempts) {
      attempts++;

      const nextBlock = session.iterator.next();
      if (nextBlock.done || !nextBlock.value) {
        break;
      }

      const block = nextBlock.value;
      const indicesKey = [...block.indices].sort((a, b) => a - b).join(',');
      if (session.seenIndicesCombinations.has(indicesKey)) {
        continue;
      }

      session.seenIndicesCombinations.add(indicesKey);

      try {
        const binary = blockToBinary(block);
        const base64Data = fromUint8Array(binary);

        nextDrafts.push({
          type: `${dataType}_fountain_packet`,
          sessionId: session.sessionId,
          packetId: session.nextPacketId,
          data: base64Data,
          profile: session.profile,
          k: block.k,
          bytes: block.bytes,
          checksum: String(block.checksum),
          indices: block.indices
        });

        session.nextPacketId++;
        generatedCount++;
      } catch (error) {
        console.error(`Error generating packet ${session.nextPacketId}:`, error);
        break;
      }
    }

    if (generatedCount < count) {
      console.warn(`⚠️ Generated ${generatedCount}/${count} additional unique packets after ${attempts} attempts`);
    }

    return nextDrafts;
  };

  const resetGeneratedPackets = () => {
    generationSessionRef.current = null;
    packetDraftsRef.current = [];
    setPackets([]);
    setCurrentPacketIndex(0);
    setIsPaused(false);
    setJumpToPacket('');
  };

  const generateFountainPackets = (mode: GenerationMode = 'normal') => {
    if (!data) {
      toast.error(`No ${dataType} data available`);
      return;
    }

    let encodedData: Uint8Array;
    let currentCompressionInfo = '';

    // Cache JSON string to avoid duplicate serialization
    const jsonString = JSON.stringify(data);

    // Check if custom compression is provided
    if (customCompress && shouldUseCompression(data, jsonString)) {
      if (import.meta.env.DEV) {
        console.log(`🗜️ Using custom compression for ${dataType} data...`);
      }
      encodedData = customCompress(data, jsonString);
      const stats = getCompressionStats(data, encodedData, jsonString);
      currentCompressionInfo = `Custom compression: ${stats.originalSize} → ${stats.compressedSize} bytes (${(100 - stats.compressionRatio * 100).toFixed(1)}% reduction, ${stats.estimatedQRReduction})`;
      toast.success(`Compressed ${dataType} data: ${(100 - stats.compressionRatio * 100).toFixed(1)}% size reduction!`);
    } else if (shouldUseCompression(data, jsonString)) {
      // Use standard compression
      if (import.meta.env.DEV) {
        console.log(`🗜️ Using standard compression for ${dataType} data...`);
      }
      encodedData = compressData(data, jsonString);
      const stats = getCompressionStats(data, encodedData, jsonString);
      currentCompressionInfo = `Standard compression: ${stats.originalSize} → ${stats.compressedSize} bytes (${(100 - stats.compressionRatio * 100).toFixed(1)}% reduction, ${stats.estimatedQRReduction})`;
      toast.success(`Compressed data: ${(100 - stats.compressionRatio * 100).toFixed(1)}% size reduction!`);
    } else {
      // No compression - use standard JSON encoding
      encodedData = new TextEncoder().encode(jsonString);
      currentCompressionInfo = `Standard JSON: ${encodedData.length} bytes`;
    }

    // Store compression info for display
    setCompressionInfo(currentCompressionInfo);

    // Validate data size - need sufficient data for meaningful fountain codes
    const isCompressed = currentCompressionInfo.toLowerCase().includes('compress');
    const minDataSize = isCompressed ? MIN_FOUNTAIN_SIZE_COMPRESSED : MIN_FOUNTAIN_SIZE_UNCOMPRESSED;

    if (encodedData.length < minDataSize) {
      toast.error(`${dataType} data is too small (${encodedData.length} bytes). Need at least ${minDataSize} bytes for fountain code generation.`);
      console.warn(`Data too small for fountain codes: ${encodedData.length} bytes (min: ${minDataSize})`);
      return;
    }

    if (import.meta.env.DEV) {
      console.log(`📊 ${currentCompressionInfo}`);
    }

    const fountainEstimate = getFountainEstimate(encodedData.length, fountainProfile);
    const blockSize = fountainEstimate.blockSize;
    const ltEncoder = createEncoder(encodedData, blockSize);
    const newSessionId = `${dataType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Adaptive packet strategy based on payload size
    const estimatedBlocks = fountainEstimate.estimatedBlocks;
    const redundancyFactor = fountainEstimate.redundancyFactor;
    const targetPackets = mode === 'stuck-simulation'
      ? Math.max(1, estimatedBlocks - 2)
      : fountainEstimate.targetPackets;
    const additionalBatchSize = Math.max(Math.ceil(targetPackets * 0.35), fountainProfile === 'reliable' ? 10 : 8);

    if (import.meta.env.DEV) {
      console.log(`📊 Fountain code generation [${fountainProfile}]: ${estimatedBlocks} blocks @ ${blockSize} bytes/block, targeting ${targetPackets} packets (${Math.round((redundancyFactor - 1) * 100)}% redundancy)`);
    }
    const generationSession: FountainGenerationSession = {
      iterator: ltEncoder.fountain()[Symbol.iterator](),
      sessionId: newSessionId,
      seenIndicesCombinations: new Set(),
      nextPacketId: 0,
      profile: fountainProfile,
      additionalBatchSize
    };

    generationSessionRef.current = generationSession;
    packetDraftsRef.current = [];

    const collectedDrafts = collectAdditionalPacketDrafts(generationSession, targetPackets);
    const { drafts: stableDrafts, packets: generatedPackets } = buildPacketSet(collectedDrafts, fountainProfile);

    packetDraftsRef.current = stableDrafts;

    setPackets(generatedPackets);
    setCurrentPacketIndex(0);
    setIsPaused(false); // Start playing automatically
    setJumpToPacket(''); // Clear jump input

    const selectedSpeed = speedPresets.find(s => s.value === cycleSpeed);
    const estimatedTime = Math.round((generatedPackets.length * cycleSpeed) / 1000);
    if (mode === 'stuck-simulation') {
      toast.success(`Generated ${generatedPackets.length} packets in dev stuck-transfer mode. Scan one full cycle to trigger the warning, then use Generate More Packets.`);
    } else {
      toast.success(`Generated ${generatedPackets.length} packets - cycling at ${selectedSpeed?.label}! (~${estimatedTime}s per cycle)`);
    }
  };

  const generateMorePackets = () => {
    const session = generationSessionRef.current;
    if (!session) {
      toast.error("Generate packets first");
      return;
    }

    const previousTotal = packetDraftsRef.current.length;
    const collectedDrafts = collectAdditionalPacketDrafts(session, session.additionalBatchSize);
    const { drafts: stableDrafts, packets: generatedPackets } = buildPacketSet(collectedDrafts, session.profile);
    const addedPackets = stableDrafts.length - previousTotal;

    if (addedPackets <= 0) {
      toast.error("Could not generate additional unique packets");
      return;
    }

    packetDraftsRef.current = stableDrafts;
    setPackets(generatedPackets);
    setCurrentPacketIndex(prev => Math.min(prev, Math.max(generatedPackets.length - 1, 0)));
    setIsPaused(false);

    toast.success(`Added ${addedPackets} new packets. Now broadcasting ${generatedPackets.length} total packets.`);
  };

  // Auto-cycle packets based on selected speed (respects pause state)
  useEffect(() => {
    if (packets.length > 0 && !isPaused) {
      const interval = setInterval(() => {
        setCurrentPacketIndex(prev => (prev + 1) % packets.length);
      }, cycleSpeed);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [packets.length, cycleSpeed, isPaused]);

  // Navigation helper functions
  const togglePlayPause = () => {
    setIsPaused(!isPaused);
  };

  const goToNextPacket = () => {
    setCurrentPacketIndex(prev => (prev + 1) % packets.length);
  };

  const goToPrevPacket = () => {
    setCurrentPacketIndex(prev => (prev - 1 + packets.length) % packets.length);
  };

  const jumpToSpecificPacket = () => {
    const packetNum = parseInt(jumpToPacket);
    if (packetNum >= 1 && packetNum <= packets.length) {
      setCurrentPacketIndex(packetNum - 1); // Convert to 0-based index
      setJumpToPacket('');
      toast.success(`Jumped to packet ${packetNum}`);
    } else {
      toast.error(`Invalid packet number. Must be between 1 and ${packets.length}`);
    }
  };

  const goToFirstPacket = () => {
    setCurrentPacketIndex(0);
  };

  const goToLastPacket = () => {
    setCurrentPacketIndex(packets.length - 1);
  };

  // Helper function to check if data is sufficient for fountain code generation
  const isDataSufficient = () => {
    if (!data) return false;

    const jsonString = JSON.stringify(data);
    const useCompression = shouldUseCompression(data, jsonString);
    const minSize = useCompression ? MIN_FOUNTAIN_SIZE_COMPRESSED : MIN_FOUNTAIN_SIZE_UNCOMPRESSED;

    const encodedData = new TextEncoder().encode(jsonString);
    return encodedData.length >= minSize;
  };

  const getDataSizeInfo = () => {
    if (!data) return null;

    const jsonString = JSON.stringify(data);
    const useCompression = shouldUseCompression(data, jsonString);
    const minSize = useCompression ? MIN_FOUNTAIN_SIZE_COMPRESSED : MIN_FOUNTAIN_SIZE_UNCOMPRESSED;

    const encodedData = new TextEncoder().encode(jsonString);

    return {
      size: encodedData.length,
      sufficient: encodedData.length >= minSize,
      compressed: useCompression
    };
  };

  const currentPacket = packets[currentPacketIndex];
  const currentSpeedLabel = speedPresets.find(s => s.value === cycleSpeed)?.label;
  const dataSizeInfo = getDataSizeInfo();

  return (
    <div className="min-h-screen w-full flex flex-col items-center gap-6 px-4 pt-16 pb-32">
      <div className="flex flex-col items-center gap-4 max-w-md w-full pb-4">
        {/* Navigation Header */}
        <div className="flex items-center justify-between w-full">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
          >
            ← Back
          </Button>
          {onSwitchToScanner && (
            <Button
              onClick={onSwitchToScanner}
              variant="outline"
              size="sm"
            >
              Switch to Scanner
            </Button>
          )}
        </div>

        {/* Title and Description */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        </Card>

        {/* Generation Controls - Only show if no packets generated yet */}
        {packets.length === 0 ? (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg">Generator Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Speed Selection */}
              <div className="w-full">
                <p className="text-sm font-medium mb-2 text-center">Cycle Speed:</p>
                <div className="grid grid-cols-2 gap-2">
                  {speedPresets.map((preset) => (
                    <Button
                      key={preset.value}
                      variant={cycleSpeed === preset.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCycleSpeed(preset.value)}
                      className="text-xs"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="w-full">
                <p className="text-sm font-medium mb-2 text-center">Transfer Profile:</p>
                <div className="grid grid-cols-2 gap-2">
                  {profilePresets.map((preset) => (
                    <Button
                      key={preset.value}
                      variant={fountainProfile === preset.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFountainProfile(preset.value)}
                      className="text-xs"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {profilePresets.find(p => p.value === fountainProfile)?.description}
                </p>
              </div>

              {settingsContent && (
                <div className="pt-2 border-t">
                  {settingsContent}
                </div>
              )}

              <Button
                onClick={() => generateFountainPackets()}
                className="w-full h-12"
                disabled={!isDataSufficient()}
              >
                Generate & Start Auto-Cycling
              </Button>

              {import.meta.env.DEV && (
                <Button
                  onClick={() => generateFountainPackets('stuck-simulation')}
                  variant="outline"
                  className="w-full"
                  disabled={!isDataSufficient()}
                >
                  Dev: Simulate 99% Stall
                </Button>
              )}

              {import.meta.env.DEV && (
                <Alert>
                  <AlertDescription>
                    Dev-only: this generates fewer packets than the estimated block count so the scanner can reach the full-set warning without completing decode.
                  </AlertDescription>
                </Alert>
              )}

              {!data ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {noDataMessage}
                  </AlertDescription>
                </Alert>
              ) : data && !isDataSufficient() ? (
                <Alert variant="destructive">
                  <AlertDescription className="col-span-2">
                    {dataType} data is too small ({dataSizeInfo?.size || 0} bytes).
                    Need at least {dataSizeInfo?.compressed ? MIN_FOUNTAIN_SIZE_COMPRESSED : MIN_FOUNTAIN_SIZE_UNCOMPRESSED} bytes for fountain code generation.
                    {dataSizeInfo?.compressed && ' (Compressed data threshold)'}
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Scanning Instructions */}
            <Alert>
              <AlertTitle className="col-span-2">📱 Scanning Instructions</AlertTitle>
              <AlertDescription className="col-span-2">
                <div className="space-y-2">
                  <p>
                    Point your scanner at the QR code. Use playback controls to pause, navigate, or jump to specific packets.
                    Estimated time per cycle: {Math.round((packets.length * cycleSpeed) / 1000)}s.
                  </p>
                  <p>
                    If the receiver is missing packets, try slowing down the cycle speed or use manual navigation.
                    If they have scanned every packet once and are still stuck near 99%, use Generate More Packets to extend this same transfer.
                    If that keeps happening across retries, start a new transfer in Reliable mode.
                  </p>
                </div>
              </AlertDescription>
            </Alert>

            {/* QR Code Display */}
            <Card className="w-full">
              <CardContent className="p-4 flex justify-center">
                {currentPacket && (
                  <div className="bg-white p-4 rounded-lg shadow-lg">
                    <QRCodeSVG
                      value={currentPacket.qrPayload}
                      size={300}
                      level="L"
                      includeMargin={false}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="w-full grid grid-cols-1 gap-2">
              <Button
                onClick={generateMorePackets}
                variant="outline"
                className="w-full"
              >
                Generate More Packets (+{generationSessionRef.current?.additionalBatchSize ?? 0})
              </Button>

              <Button
                onClick={resetGeneratedPackets}
                variant="secondary"
                className="w-full"
              >
                Stop & Generate New Packets
              </Button>
            </div>

            {/* Speed & Playback Controls */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-sm">Speed & Playback Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Speed Selection */}
                <div className="w-full">
                  <p className="text-sm font-medium mb-2">Cycle Speed:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {speedPresets.map((preset) => (
                      <Button
                        key={preset.value}
                        variant={cycleSpeed === preset.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCycleSpeed(preset.value)}
                        className="text-xs"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Play/Pause and Step Controls */}
                <div className="w-full">
                  <p className="text-sm font-medium mb-2">Navigation:</p>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={goToFirstPacket}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={goToPrevPacket}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={togglePlayPause}
                      variant={isPaused ? "default" : "secondary"}
                      size="sm"
                      className="flex-2"
                    >
                      {isPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                      {isPaused ? "Play" : "Pause"}
                    </Button>
                    <Button
                      onClick={goToNextPacket}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={goToLastPacket}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Jump to Packet */}
                <div className="w-full">
                  <p className="text-sm font-medium mb-2">Jump to Packet:</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Packet #"
                      value={jumpToPacket}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numeric input
                        if (value === '' || /^\d+$/.test(value)) {
                          setJumpToPacket(value);
                        }
                      }}
                      min="1"
                      max={packets.length}
                      className="flex-1"
                    />
                    <Button
                      onClick={jumpToSpecificPacket}
                      variant="outline"
                      size="sm"
                      disabled={!jumpToPacket || parseInt(jumpToPacket) < 1 || parseInt(jumpToPacket) > packets.length}
                    >
                      Jump
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Info className="inline mt-0.5 text-muted-foreground shrink-0" size={16} />
                  <p className="text-xs text-muted-foreground">
                    Use these controls to slow down, pause, or jump through packets when the receiver needs help catching a specific code.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Packet Info */}
            {currentPacket && (
              <Card className="w-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Packet #{currentPacket.packetId + 1}
                    </CardTitle>
                    <Badge variant="outline">
                      {currentSpeedLabel} · {currentPacket.profile}
                    </Badge>
                  </div>
                  <CardDescription>
                    Broadcasting {packets.length} fountain packets
                    {compressionInfo && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {compressionInfo}
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="font-medium">Indices:</span>
                      <span className="ml-1 break-all">
                        {currentPacket.indices && currentPacket.indices.length > 20
                          ? `[${currentPacket.indices.slice(0, 20).join(',')}...+${currentPacket.indices.length - 20} more]`
                          : `[${(currentPacket.indices || []).join(',')}]`
                        }
                      </span>
                    </div>
                    <p><span className="font-medium">K:</span> {currentPacket.k ?? '-'} | <span className="font-medium">Bytes:</span> {currentPacket.bytes ?? '-'}</p>
                    <p><span className="font-medium">Checksum:</span> {currentPacket.checksum ? `${String(currentPacket.checksum).slice(0, 8)}...` : '-'}</p>
                  </div>

                  {/* Progress Indicator */}
                  <div className="w-full">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Current cycle:</span>
                      <span>{currentPacketIndex + 1}/{packets.length}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all ease-linear"
                        style={{
                          width: `${((currentPacketIndex + 1) / packets.length) * 100}%`,
                          transitionDuration: `${cycleSpeed}ms`
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
