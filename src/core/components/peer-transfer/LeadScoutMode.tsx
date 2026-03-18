/**
 * Lead Scout Mode Component
 * Handles the lead scout's workflow:
 * - Generate room code for scouts to join
 * - Display room code and connection status
 * - Manage connected scouts
 * - Request/push data with filtering options
 * - Auto-reconnect scouts on refresh/disconnect
 * - View transfer history
 */

import { Button } from '@/core/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
    ConnectedScoutCard,
    DataTransferControls,
    TransferHistoryCard,
    RoomCodeConnection
} from '@/core/components/peer-transfer';
import { DataFilteringControls } from '@/core/components/data-transfer/DataFilteringControls';
import { extractEventKeys, extractTeamNumbers, filterPitScoutingEntries, type DataFilters } from '@/core/lib/dataFiltering';
import { loadScoutingData } from '@/core/lib/scoutingDataUtils';
import { type PitScoutingData } from '@/core/lib/pitScoutingUtils';
import type { TransferDataType } from '@/core/contexts/WebRTCContext';
import { debugLog, getRelativeTime } from '@/core/lib/peerTransferUtils';

interface ConnectedScout {
    id: string;
    name: string;
    channel: RTCDataChannel | null;
}

interface ReceivedDataEntry {
    scoutName: string;
    data: unknown;
    timestamp: number;
}

interface LeadScoutModeProps {
    connectedScouts: ConnectedScout[];
    receivedData: ReceivedDataEntry[];
    dataType: TransferDataType;
    setDataType: (type: TransferDataType) => void;
    filters: DataFilters;
    appliedFilters: DataFilters;
    allScoutingData: Awaited<ReturnType<typeof loadScoutingData>> | null;
    allPitScoutingData: PitScoutingData | null;
    allScoutNames: string[];
    historyCollapsed: boolean;
    setHistoryCollapsed: (collapsed: boolean) => void;
    requestingScouts: Set<string>;
    setRequestingScouts: React.Dispatch<React.SetStateAction<Set<string>>>;
    setImportedDataCount: (count: number) => void;
    onBack: () => void;
    onRequestDataFromScout: (scoutId: string, filters: DataFilters, dataType: TransferDataType) => void;
    onRequestDataFromAll: (filters: DataFilters, dataType: TransferDataType) => void;
    onPushData: (dataType: TransferDataType, scouts: ConnectedScout[], filters?: DataFilters) => void;
    onPushDataToScout: (scoutId: string, data: unknown, dataType: TransferDataType) => void;
    onDisconnectScout: (scoutId: string) => void;
    onAddToHistory: (entry: ReceivedDataEntry) => void;
    onClearHistory: () => void;
    onFiltersChange: (filters: DataFilters) => void;
    onApplyFilters: () => void;
}

export const LeadScoutMode = ({
    connectedScouts,
    receivedData,
    dataType,
    setDataType,
    filters,
    appliedFilters,
    allScoutingData,
    allPitScoutingData,
    allScoutNames,
    historyCollapsed,
    setHistoryCollapsed,
    requestingScouts,
    setRequestingScouts,
    setImportedDataCount,
    onBack,
    onRequestDataFromScout,
    onRequestDataFromAll,
    onPushData,
    onPushDataToScout,
    onDisconnectScout,
    onAddToHistory,
    onClearHistory,
    onFiltersChange,
    onApplyFilters,
}: LeadScoutModeProps) => {
    const supportsFilters = dataType === 'scouting' || dataType === 'combined' || dataType === 'pit-scouting' || dataType === 'scout';
    const hasPendingFilterChanges = JSON.stringify(filters) !== JSON.stringify(appliedFilters);
    const pitFilterSummary = allPitScoutingData
        ? (() => {
            const filteredEntries = filterPitScoutingEntries(allPitScoutingData.entries, filters);
            return `Available data: ${filteredEntries.length} pit entries`;
        })()
        : undefined;
    const scoutFilterSummary = (() => {
        const selectedScoutCount = filters.scouts.includeAll
            ? allScoutNames.length
            : filters.scouts.selectedScouts.length;
        return `Available data: ${selectedScoutCount} ${selectedScoutCount === 1 ? 'scout' : 'scouts'}`;
    })();

    return (
        <div className="h-screen w-full flex flex-col items-center justify-start px-4 pt-12 pb-24 2xl:pb-6 overflow-y-auto">
            <div className="flex flex-col items-start gap-6 max-w-md w-full">
                <Button onClick={onBack} variant="ghost" size="sm">
                    ← Change Mode
                </Button>

                <div className="w-full">
                    <h1 className="text-2xl font-bold mb-2">Lead Scout Session</h1>
                    <p className="text-muted-foreground">
                        Scouts connect using the room code below
                    </p>
                </div>

                <RoomCodeConnection mode="lead" />

                {connectedScouts.length > 0 && (
                    <DataTransferControls
                        dataType={dataType}
                        onDataTypeChange={(value) => setDataType(value)}
                        readyScoutsCount={connectedScouts.filter(s => s.channel?.readyState === 'open').length}
                        onRequestData={() => {
                            const requestFilters = supportsFilters ? appliedFilters : undefined;
                            const readyScouts = connectedScouts.filter(s => s.channel?.readyState === 'open');
                            setRequestingScouts(new Set(readyScouts.map(s => s.id)));
                            setImportedDataCount(receivedData.length);
                            debugLog('📤 Requesting', dataType, 'data with filters:', requestFilters);
                            onRequestDataFromAll(requestFilters as DataFilters, dataType);
                        }}
                        onPushData={() => onPushData(dataType, connectedScouts, supportsFilters ? appliedFilters : undefined)}
                    />
                )}

                <Card className="w-full">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Connected Scouts</span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        console.log('🔄 Refreshing connected scouts state');
                                        setRequestingScouts(new Set(requestingScouts));
                                    }}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Badge variant="secondary">{connectedScouts.length} connected</Badge>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {connectedScouts.length === 0 ? (
                            <div className="text-center py-4">
                                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                    No scouts connected yet
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {connectedScouts.map(scout => (
                                    <ConnectedScoutCard
                                        key={scout.id}
                                        scout={scout}
                                        isRequesting={requestingScouts.has(scout.id)}
                                        receivedData={receivedData}
                                        dataType={dataType}
                                        pushFilters={supportsFilters ? appliedFilters : undefined}
                                        onRequestData={(scoutId) => {
                                            const requestFilters = supportsFilters ? appliedFilters : undefined;
                                            setRequestingScouts(prev => new Set(prev).add(scoutId));
                                            debugLog('📤 Requesting', dataType, 'data from', scout.name, 'with filters:', requestFilters);
                                            onRequestDataFromScout(scoutId, requestFilters as DataFilters, dataType);
                                        }}
                                        onPushData={onPushDataToScout}
                                        onDisconnect={(scoutId) => {
                                            onDisconnectScout(scoutId);
                                        }}
                                        onAddToHistory={onAddToHistory}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {connectedScouts.length > 0 && supportsFilters && (
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>Filter Data Request (Optional)</CardTitle>
                            <CardDescription>
                                {allScoutingData && allScoutingData.length > 0
                                    ? `Request specific data from scouts • Current dataset: ${allScoutingData.length} entries`
                                    : 'Request specific data from scouts'}
                                {hasPendingFilterChanges
                                    ? ' • Preview updated, click Apply Filters before requesting or pushing data'
                                    : ' • Applied filters will be used for the next request or push'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <DataFilteringControls
                                data={(dataType === 'scouting' || dataType === 'combined') && allScoutingData && allScoutingData.length > 0
                                    ? { entries: allScoutingData, exportedAt: Date.now(), version: '1.0' }
                                    : undefined}
                                filters={filters}
                                onFiltersChange={onFiltersChange}
                                onApplyFilters={onApplyFilters}
                                useCompression={false}
                                hideQRStats={true}
                                showMatchRange={dataType === 'scouting' || dataType === 'combined'}
                                showEventFilter={dataType !== 'scout'}
                                showTeamFilter={dataType === 'scouting' || dataType === 'combined' || dataType === 'pit-scouting'}
                                showScoutFilter={dataType === 'scout' || dataType === 'combined'}
                                availableEvents={dataType === 'pit-scouting' && allPitScoutingData
                                    ? extractEventKeys({ entries: allPitScoutingData.entries as never[], exportedAt: Date.now(), version: '1.0' })
                                    : undefined}
                                availableTeams={dataType === 'pit-scouting' && allPitScoutingData
                                    ? extractTeamNumbers({ entries: allPitScoutingData.entries as never[], exportedAt: Date.now(), version: '1.0' })
                                    : undefined}
                                availableScouts={dataType === 'scout' || dataType === 'combined' ? allScoutNames : undefined}
                                summaryOverride={dataType === 'pit-scouting' ? pitFilterSummary : dataType === 'scout' ? scoutFilterSummary : undefined}
                            />
                        </CardContent>
                    </Card>
                )}

                {connectedScouts.length > 0 && !supportsFilters && (
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>Filter Data Request</CardTitle>
                            <CardDescription>
                                Wi-Fi filters currently apply to Scouting Data, Pit Scouting, Scout Profiles, and Combined requests.
                                Match Schedule and Pit Assignments always transfer in full.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                )}

                {receivedData.length > 0 && (
                    <TransferHistoryCard
                        receivedData={receivedData}
                        historyCollapsed={historyCollapsed}
                        onToggleCollapse={() => setHistoryCollapsed(!historyCollapsed)}
                        onClearHistory={onClearHistory}
                        getRelativeTime={getRelativeTime}
                    />
                )}
            </div>
        </div>
    );
};
