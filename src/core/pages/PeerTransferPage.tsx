/**
 * Peer-to-Peer Data Transfer Page with WebRTC Room Code System
 * Lead Scout Mode: Generate room code, wait for scouts to join, push/request data
 * Scout Mode: Enter room code, join lead's room, respond to requests
 * Features: Auto-reconnect, persistent connections across navigation, bulk transfers
 */

import { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '@/core/contexts/WebRTCContext';
import { useWebRTCQRTransfer } from '@/core/hooks/useWebRTCQRTransfer';
import { type ConflictInfo } from '@/core/lib/scoutingDataUtils';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import { useConflictResolution } from '@/core/hooks/useConflictResolution';
import ConflictResolutionDialog from '@/core/components/data-transfer/ConflictResolutionDialog';
import { BatchConflictDialog } from '@/core/components/data-transfer/BatchConflictDialog';
import { createDefaultFilters, type DataFilters } from '@/core/lib/dataFiltering';
import { loadScoutingData } from '@/core/lib/scoutingDataUtils';
import { toast } from 'sonner';
import type { TransferDataType } from '@/core/contexts/WebRTCContext';
import {
    ModeSelectionScreen,
    LeadScoutMode,
    ScoutMode,
    ErrorDialog,
} from '@/core/components/peer-transfer';
import { usePeerTransferPush } from '@/core/hooks/usePeerTransferPush';
import { usePeerTransferImport } from '@/core/hooks/usePeerTransferImport';
import { debugLog } from '@/core/lib/peerTransferUtils';

const PeerTransferPage = () => {
    const { mode: webrtcMode, setMode: setWebrtcMode, signaling } = useWebRTC();
    const mode = webrtcMode;
    const setMode = setWebrtcMode;
    const [importedDataCount, setImportedDataCount] = useState(0);
    const [requestingScouts, setRequestingScouts] = useState<Set<string>>(new Set());
    const [historyCollapsed, setHistoryCollapsed] = useState(false);

    const [filters, setFilters] = useState<DataFilters>(createDefaultFilters());
    const [allScoutingData, setAllScoutingData] = useState<Awaited<ReturnType<typeof loadScoutingData>> | null>(null);

    const [dataType, setDataType] = useState<TransferDataType>('scouting');

    const [showErrorDialog, setShowErrorDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const [showBatchDialog, setShowBatchDialog] = useState(false);
    const [batchReviewEntries, setBatchReviewEntries] = useState<ScoutingEntryBase[]>([]);
    const [pendingConflicts, setPendingConflicts] = useState<ConflictInfo[]>([]);

    const {
        showConflictDialog,
        setShowConflictDialog,
        currentConflicts,
        setCurrentConflicts,
        currentConflictIndex,
        setCurrentConflictIndex,
        setConflictResolutions,
        handleConflictResolution,
        handleBatchResolve,
        handleUndo,
        canUndo,
        handleBatchReviewDecision: handleBatchReviewDecisionBase,
        isProcessing
    } = useConflictResolution();

    const myRole = localStorage.getItem("playerStation") || 'unknown';

    const {
        connectedScouts,
        receivedData,
        clearReceivedData,
        addToReceivedData,
        shouldAttemptReconnect,
        setShouldAttemptReconnect,
        requestDataFromScout,
        requestDataFromAll,
        pushDataToAll,
        pushDataToScout,
        disconnectScout,
        reset,
    } = useWebRTCQRTransfer();

    const { pushData } = usePeerTransferPush({
        addToReceivedData,
        pushDataToAll
    });

    usePeerTransferImport({
        receivedData,
        importedDataCount,
        setImportedDataCount,
        connectedScouts,
        setRequestingScouts,
        setBatchReviewEntries,
        setPendingConflicts,
        setShowBatchDialog,
        setCurrentConflicts,
        setCurrentConflictIndex,
        setConflictResolutions,
        setShowConflictDialog,
        setErrorMessage,
        setShowErrorDialog,
    });

    useEffect(() => {
        if (receivedData.length > importedDataCount) {
            const latest = receivedData[receivedData.length - 1];
            if (!latest) return;
            const scoutId = connectedScouts.find(s => s.name === latest.scoutName)?.id;

            if (scoutId && requestingScouts.has(scoutId)) {
                debugLog(`🔄 Clearing requesting state for ${latest.scoutName}`);
                setRequestingScouts(prev => {
                    const next = new Set(prev);
                    next.delete(scoutId);
                    return next;
                });
            }
        }
    }, [receivedData, importedDataCount, connectedScouts, requestingScouts]);

    useEffect(() => {
        if (mode === 'lead') {
            loadScoutingData().then(data => setAllScoutingData(data)).catch(err => {
                console.error('Failed to load scouting data for filter preview:', err);
            });
        }
    }, [mode]);

    const handleFiltersChange = (newFilters: DataFilters) => {
        setFilters(newFilters);
    };

    const handleApplyFilters = () => {
        debugLog('📋 Filters updated:', filters);
    };

    const handleBatchReviewDecision = async (decision: 'replace-all' | 'skip-all' | 'review-each') => {
        debugLog(`📋 Batch review decision: ${decision}`);
        const result = await handleBatchReviewDecisionBase(batchReviewEntries, pendingConflicts, decision);
        debugLog(`📋 hasMoreConflicts: ${result.hasMoreConflicts}`);

        setShowBatchDialog(false);

        if (!result.hasMoreConflicts) {
            setBatchReviewEntries([]);
            setPendingConflicts([]);
            clearReceivedData();
            setImportedDataCount(0);
            debugLog('🧹 Clearing received data after batch review complete');
        } else {
            debugLog('⏭️ Moving to conflict dialog, not clearing data yet');
        }
    };

    useEffect(() => {
        const handleDisconnect = () => {
            toast.error('Lead has disconnected you');
            reset();
            setMode('select');
        };

        window.addEventListener('webrtc-disconnected-by-lead', handleDisconnect);
        return () => {
            window.removeEventListener('webrtc-disconnected-by-lead', handleDisconnect);
        };
    }, [reset, setMode]);

    const previousMode = useRef<string>(mode);
    useEffect(() => {
        if (mode === 'select' && previousMode.current !== 'select') {
            reset();
        }
        previousMode.current = mode;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        if (shouldAttemptReconnect && mode === 'scout') {
            const savedRoomCode = localStorage.getItem('webrtc_scout_room_code');

            if (savedRoomCode) {
                console.log('🔄 Connection lost. Will auto-rejoin room:', savedRoomCode);

                toast.info(`Connection lost. Rejoining room ${savedRoomCode}...`, {
                    duration: 3000,
                });

                if (signaling?.connected) {
                    console.log('🔄 Sending new join message after connection loss');
                    signaling.join();
                }
            } else {
                console.log('🔄 Connection lost. No saved room code.');

                toast.info('Connection lost. Please rejoin the room code to reconnect.', {
                    duration: 5000,
                });

                setMode('select');
                reset();
            }

            setShouldAttemptReconnect(false);
        }
    }, [shouldAttemptReconnect, mode, setShouldAttemptReconnect, reset, setMode, signaling]);

    const renderContent = () => {
        if (mode === 'select') {
            return (
                <ModeSelectionScreen
                    onSelectLead={() => {
                        setMode('lead');
                    }}
                    onSelectScout={() => setMode('scout')}
                />
            );
        }

        if (mode === 'lead') {
            return (
                <LeadScoutMode
                    connectedScouts={connectedScouts}
                    receivedData={receivedData}
                    dataType={dataType}
                    setDataType={setDataType}
                    filters={filters}
                    allScoutingData={allScoutingData}
                    historyCollapsed={historyCollapsed}
                    setHistoryCollapsed={setHistoryCollapsed}
                    requestingScouts={requestingScouts}
                    setRequestingScouts={setRequestingScouts}
                    setImportedDataCount={setImportedDataCount}
                    onBack={() => setMode('select')}
                    onRequestDataFromScout={requestDataFromScout}
                    onRequestDataFromAll={requestDataFromAll}
                    onPushData={pushData}
                    onPushDataToScout={pushDataToScout}
                    onDisconnectScout={(scoutId) => {
                        disconnectScout(scoutId);
                        toast.info(`Disconnected ${connectedScouts.find(s => s.id === scoutId)?.name}`);
                    }}
                    onAddToHistory={addToReceivedData}
                    onClearHistory={clearReceivedData}
                    onFiltersChange={handleFiltersChange}
                    onApplyFilters={handleApplyFilters}
                />
            );
        }

        if (mode === 'scout') {
            return (
                <ScoutMode
                    myRole={myRole}
                    onBack={() => setMode('select')}
                    onCancel={() => {
                        reset();
                        setMode('select');
                    }}
                />
            );
        }

        return null;
    };

    return (
        <>
            {renderContent()}

            <ErrorDialog
                open={showErrorDialog}
                onOpenChange={setShowErrorDialog}
                errorMessage={errorMessage}
            />

            <BatchConflictDialog
                isOpen={showBatchDialog}
                entries={batchReviewEntries}
                onResolve={handleBatchReviewDecision}
                isProcessing={isProcessing}
            />

            <ConflictResolutionDialog
                open={showConflictDialog}
                onOpenChange={setShowConflictDialog}
                conflict={currentConflicts[currentConflictIndex] || null}
                currentIndex={currentConflictIndex}
                totalConflicts={currentConflicts.length}
                onResolve={handleConflictResolution}
                onBatchResolve={handleBatchResolve}
                onUndo={handleUndo}
                canUndo={canUndo}
                isProcessing={isProcessing}
            />
        </>
    );
};

export default PeerTransferPage;
