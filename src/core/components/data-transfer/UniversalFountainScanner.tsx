/**
 * Universal QR Fountain Code Scanner
 * Framework component - game-agnostic
 * 
 * Scans QR codes and reconstructs data using Luby Transform fountain decoding.
 * Supports compression detection, progress tracking, and custom data validation.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Button } from "@/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Progress } from "@/core/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/core/components/ui/alert";
import { toast } from "sonner";
import { createDecoder, binaryToBlock } from "luby-transform";
import { toUint8Array } from "js-base64";
import { ArrowLeft, CheckCircle, TriangleAlert } from "lucide-react";
import * as pako from 'pako';
import { parseScannedFountainPacket, type FountainPacket } from "@/core/lib/fountainPacket";

export interface UniversalFountainScannerProps {
  onBack: () => void;
  onSwitchToGenerator?: () => void;
  dataType: string;
  expectedPacketType: string;
  saveData: (data: unknown) => void | Promise<void>;
  validateData: (data: unknown) => boolean;
  getDataSummary: (data: unknown) => string;
  decompressData?: (compressedData: Uint8Array) => unknown;
  title: string;
  description: string;
  completionMessage: string;
  onComplete?: () => void;
}

export const UniversalFountainScanner = ({
  onBack,
  onSwitchToGenerator,
  dataType,
  expectedPacketType,
  saveData,
  validateData,
  getDataSummary,
  decompressData,
  title,
  description,
  completionMessage,
  onComplete
}: UniversalFountainScannerProps) => {
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [reconstructedData, setReconstructedData] = useState<unknown>(null);
  const [progress, setProgress] = useState({ received: 0, needed: 0, percentage: 0 });
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [compressionDetected, setCompressionDetected] = useState<boolean | null>(null);
  const [missingPackets, setMissingPackets] = useState<number[]>([]);
  const [totalPackets, setTotalPackets] = useState<number | null>(null);

  // Use refs for immediate access without React state delays
  const decoderRef = useRef<unknown>(null);
  const packetsRef = useRef<Map<number, FountainPacket>>(new Map());
  const sessionRef = useRef<string | null>(null);
  const totalPacketsRef = useRef<number | null>(null);

  // Helper function to add debug messages (dev-only) - uses throttled updates
  const addDebugMsg = useCallback((_message: string) => {
    // Debug logging disabled for performance
    return;
  }, []);

  // Calculate missing packets based on seen packet IDs
  const calculateMissingPackets = useCallback(() => {
    const packetIds = Array.from(packetsRef.current.keys()).sort((a, b) => a - b);

    if (packetIds.length === 0) return [];

    const missing: number[] = [];
    const maxId = packetIds[packetIds.length - 1];

    // Ensure maxId is defined
    if (maxId === undefined) return [];

    const knownTotal = totalPacketsRef.current;

    if (typeof knownTotal === 'number' && knownTotal > 0) {
      for (let i = 0; i < knownTotal; i++) {
        if (!packetsRef.current.has(i)) {
          missing.push(i);
        }
      }
      return missing;
    }

    // Backward-compatible fallback when no total packet count is present.
    for (let i = 0; i <= maxId; i++) {
      if (!packetsRef.current.has(i)) {
        missing.push(i);
      }
    }

    // Update total packets estimate if we have a reasonable range
    const estimatedTotal = maxId + 1;
    if (estimatedTotal !== totalPacketsRef.current) {
      totalPacketsRef.current = estimatedTotal;
      setTotalPackets(estimatedTotal);
      addDebugMsg(`📊 Estimated total packets: ${estimatedTotal} (based on max packet ID: ${maxId})`);
    }

    return missing;
  }, [addDebugMsg]);

  // Manual throttle (60fps limit is still safe, but 10fps is better for heavy processing)
  const lastScanTimeRef = useRef<number>(0);
  const lastMissingUpdateRef = useRef<number>(0);

  // STABLE REFS PATTERN: Ensure handleQRScan never changes to prevent Scanner re-init
  const propsRef = useRef({
    expectedPacketType, saveData, validateData,
    completionMessage, getDataSummary, onBack, dataType, decompressData, onComplete
  });

  // Update props ref on render
  useEffect(() => {
    propsRef.current = {
      expectedPacketType, saveData, validateData,
      completionMessage, getDataSummary, onBack, dataType, decompressData, onComplete
    };
  }, [expectedPacketType, saveData, validateData, completionMessage, getDataSummary, onBack, dataType, decompressData, onComplete]);

  const neededPacketsRef = useRef<number>(0);

  const handleQRScan = useCallback(async (result: { rawValue: string; }[]) => {
    // Destructure current props/state from ref (only those used in this callback)
    const {
      expectedPacketType, saveData, validateData, decompressData
    } = propsRef.current;

    // THROTTLE: Limit scan processing to once every 50ms (20fps max)
    const now = Date.now();
    if (now - lastScanTimeRef.current < 50) {
      return;
    }
    lastScanTimeRef.current = now;

    try {
      if (!result || result.length === 0 || !result[0]) {
        addDebugMsg("❌ Empty scan result");
        return;
      }

      // Try to parse the QR code - if it's not valid JSON, it's not a fountain code
      const packet = parseScannedFountainPacket(result[0].rawValue);
      if (!packet) {
        // Not a fountain code QR - silently ignore (could be a URL, text, etc.)
        addDebugMsg(`⚠️ Not a fountain code QR (invalid JSON)`);
        return;
      }

      // Validate that it's actually a fountain packet
      if (!packet.type || !packet.sessionId || packet.packetId === undefined) {
        addDebugMsg(`⚠️ Not a fountain code packet (missing required fields)`);
        return;
      }

      const indexPreview = packet.indices ? packet.indices.join(',') : 'compact';
      addDebugMsg(`🎯 Scanned packet ${packet.packetId} with indices [${indexPreview}]`);
      addDebugMsg(`🆔 Session: ${packet.sessionId.slice(-8)}`);

      if (typeof packet.totalPackets === 'number' && packet.totalPackets > 0) {
        if (totalPacketsRef.current !== packet.totalPackets) {
          totalPacketsRef.current = packet.totalPackets;
          setTotalPackets(packet.totalPackets);
          addDebugMsg(`📦 Packet stream total: ${packet.totalPackets}`);
        }
      }

      if (packet.type !== expectedPacketType) {
        addDebugMsg(`❌ Invalid QR code format - expected ${expectedPacketType}, got ${packet.type}`);
        toast.error("Invalid QR code format");
        return;
      }

      addDebugMsg(`📊 Packets before processing: ${packetsRef.current.size}`);

      // SIMPLIFIED SESSION HANDLING - Don't reset on session changes
      if (!sessionRef.current) {
        addDebugMsg(`🆕 First session: k=${packet.k}, bytes=${packet.bytes}`);
        sessionRef.current = packet.sessionId;
        setCurrentSession(packet.sessionId);
        decoderRef.current = createDecoder();
        toast.info(`Started session: ${packet.sessionId.slice(-8)}`);
      } else if (sessionRef.current !== packet.sessionId) {
        // Just log the session change but DON'T reset anything
        addDebugMsg(`🔄 Session change noted: ${sessionRef.current.slice(-4)} → ${packet.sessionId.slice(-4)}`);
        addDebugMsg(`📌 Continuing with same decoder (ignoring session change)`);
      }

      addDebugMsg(`📊 Packets after session check: ${packetsRef.current.size}`);

      // Check if we already have this packet
      if (packetsRef.current.has(packet.packetId)) {
        addDebugMsg(`🔁 Duplicate packet ${packet.packetId} ignored`);
        addDebugMsg(`🔍 Current: indices [${indexPreview}]`);
        return;
      }

      // Store the packet
      packetsRef.current.set(packet.packetId, packet);
      addDebugMsg(`📦 Added packet ${packet.packetId}, total: ${packetsRef.current.size}`);

      // Use decoder
      if (decoderRef.current) {
        try {
          // Convert base64 back to binary and create block
          const binaryData = toUint8Array(packet.data);
          const block = binaryToBlock(binaryData);

          // Add block to decoder
          addDebugMsg(`🔧 Adding block to decoder...`);
          const isOkay = (decoderRef.current as any).addBlock(block);
          addDebugMsg(`📊 Decoder result: ${isOkay ? 'COMPLETE!' : 'Need more'}`);

          if (isOkay) {
            addDebugMsg("🎉 DECODING COMPLETE!");
            const decodedData = (decoderRef.current as any).getDecoded();
            addDebugMsg(`📊 Decoded data size: ${decodedData.length} bytes`);

            let parsedData: unknown;

            try {
              // Check if data is gzip compressed (starts with magic bytes 1f 8b)
              const isGzipCompressed = decodedData.length > 2 &&
                decodedData[0] === 0x1f &&
                decodedData[1] === 0x8b;

              if (isGzipCompressed) {
                addDebugMsg("🗜️ Detected compressed data, decompressing...");
                setCompressionDetected(true);

                if (decompressData) {
                  // Use custom decompression if provided
                  parsedData = decompressData(decodedData);
                } else {
                  // Use standard gzip decompression
                  const decompressed = pako.ungzip(decodedData);
                  const jsonString = new TextDecoder().decode(decompressed);
                  parsedData = JSON.parse(jsonString);
                }
                addDebugMsg("✅ Decompression successful");
              } else {
                // Uncompressed data - standard JSON decoding
                addDebugMsg("📄 Detected uncompressed data");
                setCompressionDetected(false);
                const jsonString = new TextDecoder().decode(decodedData);
                parsedData = JSON.parse(jsonString);
                addDebugMsg("✅ JSON parsing successful");
              }
            } catch (error) {
              addDebugMsg(`❌ Data processing failed: ${error instanceof Error ? error.message : String(error)}`);
              toast.error("Failed to process reconstructed data");
              return;
            }

            // Debug: Log the structure of the parsed data
            addDebugMsg(`🔍 Parsed data type: ${typeof parsedData}`);
            addDebugMsg(`🔍 Data keys: ${parsedData && typeof parsedData === 'object' ? Object.keys(parsedData as Record<string, unknown>).join(', ') : 'N/A'}`);

            if (validateData(parsedData)) {
              setReconstructedData(parsedData);
              setIsComplete(true);
              setProgress({ received: packetsRef.current.size, needed: packetsRef.current.size, percentage: 100 });

              await saveData(parsedData);
            } else {
              addDebugMsg("❌ Reconstructed data failed validation");
              toast.error("Reconstructed data is invalid");
            }
            return;
          }
        } catch (error) {
          addDebugMsg(`🚨 Block error: ${error instanceof Error ? error.message : String(error)}`);
          toast.error("Failed to process packet");
          return;
        }
      }

      // Update progress estimate
      const received = packetsRef.current.size;
      const packetK = typeof packet.k === 'number' ? packet.k : 0;
      const announcedTotal = totalPacketsRef.current;
      let estimatedNeeded = 0;

      if (typeof announcedTotal === 'number' && announcedTotal > 0) {
        estimatedNeeded = announcedTotal;
      } else {
        // Mixed-version fallback: older generators may not include totalPackets.
        // Keep this estimate path temporarily so partially updated fleets can still transfer.
        const baseEstimate = Math.max(packetK + 3, 10);

        // Track the highest estimate we've seen using REF, avoiding state dependency
        if (baseEstimate > neededPacketsRef.current) {
          neededPacketsRef.current = baseEstimate;
        } else if (neededPacketsRef.current === 0) {
          neededPacketsRef.current = baseEstimate;
        }

        estimatedNeeded = neededPacketsRef.current;
      }

      // Calculate percentage, capping at 99% until decoder completes
      const progressPercentage = Math.min((received / estimatedNeeded) * 100, 99);

      setProgress({
        received,
        needed: estimatedNeeded,
        percentage: progressPercentage
      });

      // Calculate and update missing packets - THROTTLED to avoid re-renders
      const shouldCalculateMissing = (typeof totalPacketsRef.current === 'number' && totalPacketsRef.current > 0)
        || (packetK > 0 && received > packetK && progressPercentage > 90);

      if (shouldCalculateMissing) {
        addDebugMsg(`🔍 High packet count but no completion yet: k=${packetK}, received=${received}`);
        const missing = calculateMissingPackets();

        // Log missing packets info (only when we calculate them)
        if (missing.length > 0 && missing.length <= 20) {
          addDebugMsg(`🔍 Missing packets: [${missing.join(', ')}]`);
        } else if (missing.length > 20) {
          addDebugMsg(`🔍 Missing ${missing.length} packets: [${missing.slice(0, 5).join(', ')}, ..., ${missing.slice(-5).join(', ')}]`);
        } else {
          addDebugMsg(`✅ No missing packets in current range!`);
        }

        // Simple equality check to avoid re-render if identical
        setMissingPackets(prev => {
          if (prev.length === missing.length &&
            prev.length > 0 && missing.length > 0 &&
            prev[0] === missing[0]) {
            return prev;
          }
          return missing;
        });
        lastMissingUpdateRef.current = Date.now();
      }

      // Add debugging when we're getting close to completion but decoder isn't ready
      if (packetK > 0 && received > packetK && progressPercentage > 90) {
        addDebugMsg(`🔍 High packet count but no completion yet: k=${packetK}, received=${received}`);
        addDebugMsg(`🔍 Decoder state check needed - may need more packets than theoretical minimum`);

        // Alert user if we've scanned significantly more than expected
        if (received > estimatedNeeded * 1.5) {
          addDebugMsg(`⚠️ SCANNING MAY BE STUCK: ${received} packets >> ${estimatedNeeded} estimated`);
          addDebugMsg(`💡 Consider checking the generator for packet navigation controls`);
        }
      }

    } catch (error) {
      addDebugMsg(`❌ QR scan error: ${error instanceof Error ? error.message : String(error)}`);
      console.error("QR scan error:", error);
      toast.error("Error processing QR code");
    }
  }, [addDebugMsg, calculateMissingPackets]);

  const resetScanner = () => {
    sessionRef.current = null;
    setCurrentSession(null);
    decoderRef.current = null;
    packetsRef.current.clear();
    totalPacketsRef.current = null;
    neededPacketsRef.current = 0;
    setProgress({ received: 0, needed: 0, percentage: 0 });
    setIsComplete(false);
    setReconstructedData(null);
    setDebugLog([]);
    setCompressionDetected(null);
    setMissingPackets([]);
    setTotalPackets(null);
    addDebugMsg("🔄 Scanner reset");
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    } else {
      toast.success(`${dataType} data loaded successfully!`);
      onBack();
    }
  };

  const hasScannedEntirePacketSet = !isComplete
    && typeof totalPackets === 'number'
    && totalPackets > 0
    && progress.received >= totalPackets
    && missingPackets.length === 0;

  if (isComplete && reconstructedData) {
    return (
      <div className="h-screen w-full flex flex-col items-center px-4 pt-6 pb-6">
        <div className="flex flex-col gap-4 max-w-md w-full">
          <Button
            onClick={onBack}
            variant="outline"
            size="sm"
            className="self-start"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <CardTitle className="text-green-600">Reconstruction Complete!</CardTitle>
              <CardDescription>
                {completionMessage}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {getDataSummary(reconstructedData)}
                </Badge>
                <Badge variant="outline">
                  {progress.received} packets received
                </Badge>
              </div>

              <div className="w-full space-y-2">
                <Button
                  onClick={handleComplete}
                  className="w-full"
                >
                  Continue to App
                </Button>

                <Button
                  onClick={resetScanner}
                  variant="outline"
                  className="w-full"
                >
                  Scan More Data
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground text-start space-y-1">
            <p>• Data saved to local storage</p>
            <p>• Ready to use throughout the app</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center gap-6 px-4 pt-16 pb-6">
      <div className="flex flex-col items-center gap-4 max-w-md w-full">
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
          {onSwitchToGenerator && (
            <Button
              onClick={onSwitchToGenerator}
              variant="outline"
              size="sm"
            >
              Switch to Generator
            </Button>
          )}
        </div>

        {/* Scanning Instructions */}
        <Alert>
          <AlertTitle className="col-span-2">📱 Scanning Instructions</AlertTitle>
          <AlertDescription className="col-span-2">
            Scan fountain code packets in any order. Reconstruction will complete automatically when enough data is received.
          </AlertDescription>
        </Alert>

        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {currentSession && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Badge variant="secondary">
                  Session: ...{currentSession.slice(-8)}
                </Badge>
                <Badge variant="outline">
                  {progress.received} packets
                </Badge>
                <Badge variant="outline">
                  {progress.percentage.toFixed(1)}%
                </Badge>
                {compressionDetected === true && (
                  <Badge variant="default" className="bg-green-600">
                    🗜️ Compressed
                  </Badge>
                )}
                {compressionDetected === false && (
                  <Badge variant="outline">
                    📄 Standard
                  </Badge>
                )}
              </div>
            )}

            <div className="w-full h-64 md:h-80 overflow-hidden rounded-lg">
              <Scanner
                components={{ finder: false }}
                scanDelay={100}
                styles={{
                  video: {
                    borderRadius: "7.5%",
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }
                }}
                onScan={handleQRScan}
                onError={() =>
                  toast.error("QR Scanner Error")
                }
              />
            </div>

            {progress.received > 0 && (
              <div className="w-full">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>{progress.percentage.toFixed(1)}%</span>
                </div>
                <Progress
                  value={Math.min(progress.percentage, 100)}
                  className="w-full"
                />

                {/* Missing packets indicator */}
                {missingPackets.length > 0 && totalPackets && (
                  <div className="mt-2 text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-muted-foreground">Missing Packets</span>
                      <Badge variant="outline" className="text-xs">
                        {missingPackets.length} missing
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground p-2 bg-muted rounded max-h-16 overflow-y-auto">
                      {missingPackets.length <= 30 ? (
                        <span>#{missingPackets.map(p => p + 1).join(', #')}</span>
                      ) : (
                        <span>
                          #{missingPackets.slice(0, 10).map(p => p + 1).join(', #')}
                          <span className="text-orange-500"> ... and {missingPackets.length - 10} more</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Complete packets indicator when no missing */}
                {missingPackets.length === 0 && totalPackets && progress.received > 5 && (
                  <div className="mt-2 text-sm">
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span className="text-xs">All packets in range #{1} - #{totalPackets}</span>
                    </div>
                  </div>
                )}

                {hasScannedEntirePacketSet && (
                  <Alert className="mt-3 text-left border-amber-500/50 bg-amber-50">
                    <TriangleAlert className="h-4 w-4 text-amber-700" />
                    <AlertTitle className="text-amber-900">All generated packets have been scanned</AlertTitle>
                    <AlertDescription className="text-amber-800">
                      If the receiver is missing packets, try slowing down the cycle speed or use manual navigation.
                      If they have scanned every packet once and are still stuck near 99%, use Generate More Packets to extend this same transfer.
                      If that keeps happening across retries, start a new transfer in Reliable mode.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex gap-2 w-full flex-wrap">
              {currentSession && (
                <Button
                  onClick={resetScanner}
                  variant="outline"
                  className="flex-1 min-w-0"
                >
                  Reset Scanner
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Debug Log - Dev Only */}
        {import.meta.env.DEV && debugLog.length > 0 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-sm">Debug Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs font-mono bg-muted p-2 rounded max-h-40 overflow-y-auto space-y-1">
                {debugLog.map((msg, i) => (
                  <div key={i}>{msg}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
