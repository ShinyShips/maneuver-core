import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Route,
  RouterProvider,
  createBrowserRouter,
  createMemoryRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { ThemeProvider } from '@/core/components/theme-provider';
import { analytics } from '@/core/lib/analytics';
import MainLayout from '@/core/layouts/MainLayout';
import NotFoundPage from '@/core/pages/NotFoundPage';
import HomePage from '@/core/pages/HomePage';
import GameStartPage from '@/core/pages/GameStartPage';
import ClearDataPage from '@/core/pages/ClearDataPage';
import AutoStartPage from '@/core/pages/AutoStartPage';
import AutoScoringPage from '@/core/pages/AutoScoringPage';
import TeleopScoringPage from '@/core/pages/TeleopScoringPage';
import EndgamePage from '@/core/pages/EndgamePage';
import { PitScoutingPage } from '@/core/pages/PitScoutingPage';
import APIDataPage from '@/core/pages/APIDataPage';
import JSONDataTransferPage from '@/core/pages/JSONDataTransferPage';
import PeerTransferPage from '@/core/pages/PeerTransferPage';
import QRDataTransferPage from '@/core/pages/QRDataTransferPage';
import TeamStatsPage from '@/core/pages/TeamStatsPage';
import StrategyOverviewPage from '@/core/pages/StrategyOverviewPage';
import MatchStrategyPage from '@/core/pages/MatchStrategyPage';
import PickListPage from '@/core/pages/PickListPage';
import ScoutManagementDashboardPage from '@/core/pages/ScoutManagementDashboardPage';
import AchievementsPage from '@/core/pages/AchievementsPage';
import DevUtilitiesPage from '@/core/pages/DevUtilitiesPage';
import { MatchValidationPage } from '@/core/pages/MatchValidationPage';
import PitAssignmentsPage from '@/core/pages/PitAssignmentsPage';
import { InstallPrompt } from '@/core/components/pwa/InstallPrompt';
import { PWAUpdatePrompt } from '@/core/components/pwa/PWAUpdatePrompt';
import { StatusBarSpacer } from '@/core/components/StatusBarSpacer';
import { SplashScreen } from '@/core/components/SplashScreen';
import { FullscreenProvider } from '@/core/contexts/FullscreenContext';
import { WebRTCProvider } from '@/core/contexts/WebRTCContext';
import { ScoutProvider } from '@/core/contexts/ScoutContext';
import { WebRTCDataRequestDialog } from '@/core/components/webrtc/WebRTCDataRequestDialog';
import { WebRTCPushedDataDialog } from '@/core/components/webrtc/WebRTCPushedDataDialog';
import { WebRTCNotifications } from '@/core/components/webrtc/WebRTCNotifications';
import { GameProvider } from '@/core/contexts/GameContext';
import { strategyAnalysis } from '@/game-template/analysis';
import { scoringCalculations } from '@/game-template/scoring';
import { gameDataTransformation } from '@/game-template/transformation';
import {
  StatusToggles,
  GameSpecificQuestions,
  GameSpecificScoutOptions,
} from '@/game-template/components';
import type { ScoutingEntryBase } from '@/types/scouting-entry';
import type {
  DataTransformation,
  GameConfig,
  ScoringCalculations,
  StrategyAnalysis,
  UIComponents,
  ValidationRules,
} from '@/types/game-interfaces';
import type { MatchValidationResult, ValidationConfig } from '@/types/game-interfaces';
import logo from '@/assets/Maneuver Wordmark Vertical.png';

type FrameworkRouter = ReturnType<typeof createBrowserRouter>;

export interface FrameworkGameBindings<TEntry extends ScoutingEntryBase = ScoutingEntryBase> {
  config: GameConfig;
  scoring: ScoringCalculations<TEntry>;
  validation: ValidationRules<TEntry>;
  analysis: StrategyAnalysis<TEntry>;
  transformation: DataTransformation;
  ui: UIComponents<TEntry>;
}

export interface FrameworkShellRuntimeOptions {
  showSplashScreen: boolean;
  enablePwaPrompts: boolean;
  enableWebRtcShell: boolean;
  trackPwaLifecycle: boolean;
  enableDebugGlobals: boolean;
}

export interface CreateFrameworkRouterOptions {
  kind?: 'browser' | 'memory';
  initialEntries?: string[];
  gameBindings?: FrameworkGameBindings;
  homePageLogo?: string;
}

export interface FrameworkShellProps {
  router?: FrameworkRouter;
  runtime?: Partial<FrameworkShellRuntimeOptions>;
}

const defaultValidation: ValidationRules<ScoutingEntryBase> = {
  getDataCategories: () => [],
  calculateAllianceStats: () => ({}),
  calculateAllianceScore: () => ({ auto: 0, teleop: 0, endgame: 0, total: 0 }),
  validateMatch: async () => ({}) as MatchValidationResult,
  getDefaultConfig: () => ({ thresholds: defaultValidationThresholds }),
};

const defaultValidationThresholds = {
  critical: 25,
  warning: 15,
  minor: 5,
  criticalAbsolute: 5,
  warningAbsolute: 3,
  minorAbsolute: 1,
} satisfies ValidationConfig['thresholds'];

const defaultUiComponents = {
  GameStartScreen: () => null,
  AutoScoringScreen: () => null,
  TeleopScoringScreen: () => null,
  StatusToggles,
  PitScoutingQuestions: GameSpecificQuestions,
  ScoutOptionsContent: GameSpecificScoutOptions,
} as UIComponents<ScoutingEntryBase>;

export const defaultFrameworkGameBindings: FrameworkGameBindings = {
  config: {
    year: 2025,
    gameName: 'Template Game',
  },
  scoring: scoringCalculations as ScoringCalculations<ScoutingEntryBase>,
  validation: defaultValidation,
  analysis: strategyAnalysis as StrategyAnalysis<ScoutingEntryBase>,
  transformation: gameDataTransformation,
  ui: defaultUiComponents,
};

export const defaultFrameworkShellRuntime: FrameworkShellRuntimeOptions = {
  showSplashScreen: true,
  enablePwaPrompts: true,
  enableWebRtcShell: true,
  trackPwaLifecycle: true,
  enableDebugGlobals: import.meta.env.DEV,
};

function buildFrameworkRoutes({
  gameBindings = defaultFrameworkGameBindings,
  homePageLogo = logo,
}: Omit<CreateFrameworkRouterOptions, 'initialEntries' | 'kind'> = {}) {
  return createRoutesFromElements(
    <Route
      path="/"
      element={
        <GameProvider
          config={gameBindings.config}
          scoring={gameBindings.scoring}
          validation={gameBindings.validation}
          analysis={gameBindings.analysis}
          transformation={gameBindings.transformation}
          ui={gameBindings.ui}
        >
          <MainLayout />
        </GameProvider>
      }
    >
      <Route index element={<HomePage logo={homePageLogo} />} />
      <Route path="/game-start" element={<GameStartPage />} />
      <Route path="/auto-start" element={<AutoStartPage />} />
      <Route path="/auto-scoring" element={<AutoScoringPage />} />
      <Route path="/teleop-scoring" element={<TeleopScoringPage />} />
      <Route path="/endgame" element={<EndgamePage />} />
      <Route path="/clear-data" element={<ClearDataPage />} />
      <Route path="/pit-scouting" element={<PitScoutingPage />} />
      <Route path="/api-data" element={<APIDataPage />} />
      <Route path="/json-transfer" element={<JSONDataTransferPage />} />
      <Route path="/peer-transfer" element={<PeerTransferPage />} />
      <Route path="/qr-transfer" element={<QRDataTransferPage />} />
      <Route path="/team-stats" element={<TeamStatsPage />} />
      <Route path="/strategy-overview" element={<StrategyOverviewPage />} />
      <Route path="/match-strategy" element={<MatchStrategyPage />} />
      <Route path="/pick-list" element={<PickListPage />} />
      <Route path="/scout-management" element={<ScoutManagementDashboardPage />} />
      <Route path="/pit-assignments" element={<PitAssignmentsPage />} />
      <Route path="/achievements" element={<AchievementsPage />} />
      <Route path="/match-validation" element={<MatchValidationPage />} />
      <Route path="/dev-utilities" element={<DevUtilitiesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>,
  );
}

export function createFrameworkRouter(options: CreateFrameworkRouterOptions = {}): FrameworkRouter {
  const routes = buildFrameworkRoutes(options);

  if (options.kind === 'memory') {
    return createMemoryRouter(routes, {
      initialEntries: options.initialEntries ?? ['/'],
    });
  }

  return createBrowserRouter(routes);
}

function MaybeWrap({
  enabled,
  wrapper,
  children,
}: {
  enabled: boolean;
  wrapper: (children: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  return <>{enabled ? wrapper(children) : children}</>;
}

function useFrameworkRuntime(runtime: FrameworkShellRuntimeOptions) {
  useEffect(() => {
    if (!runtime.trackPwaLifecycle) {
      return undefined;
    }

    const handleBeforeInstallPrompt = () => {
      analytics.trackEvent('pwa_install_prompt_shown');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
      analytics.trackPWALaunched();
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [runtime.trackPwaLifecycle]);

  useEffect(() => {
    if (!runtime.enableDebugGlobals) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      analytics.debug();
      (window as typeof window & { analytics: typeof analytics }).analytics = analytics;

      import('@/core/lib/achievementUtils').then((achievementUtils) => {
        (window as Window & {
          achievements?: { backfillAll: typeof achievementUtils.backfillAchievementsForAllScouts };
        }).achievements = {
          backfillAll: achievementUtils.backfillAchievementsForAllScouts,
        };
      });

      import('@/core/lib/testDataGenerator').then((testData) => {
        (window as Window & {
          dev?: {
            seedData: () => Promise<void>;
            seedScouts: typeof testData.generateRandomScouts;
            resetDB: typeof testData.resetEntireDatabase;
          };
        }).dev = {
          seedData: () => testData.generateRandomScoutingData(30),
          seedScouts: testData.generateRandomScouts,
          resetDB: testData.resetEntireDatabase,
        };
      });

      import('@/db').then((databases) => {
        (window as Window & {
          dbs?: {
            main: typeof databases.db;
            pit: typeof databases.pitDB;
            game: typeof databases.gameDB;
          };
        }).dbs = {
          main: databases.db,
          pit: databases.pitDB,
          game: databases.gameDB,
        };
      });
    }, 2_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [runtime.enableDebugGlobals]);
}

export function FrameworkShell({ router, runtime }: FrameworkShellProps) {
  const resolvedRuntime = {
    ...defaultFrameworkShellRuntime,
    ...runtime,
  };
  const [showSplash, setShowSplash] = useState(resolvedRuntime.showSplashScreen);
  const resolvedRouter = useMemo(
    () => router ?? createFrameworkRouter(),
    [router],
  );

  useFrameworkRuntime(resolvedRuntime);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <ScoutProvider>
        <FullscreenProvider>
          <MaybeWrap
            enabled={resolvedRuntime.enableWebRtcShell}
            wrapper={(children) => <WebRTCProvider>{children}</WebRTCProvider>}
          >
            <div className="min-h-screen bg-background">
              <RouterProvider router={resolvedRouter} />
              {resolvedRuntime.enablePwaPrompts ? (
                <>
                  <InstallPrompt />
                  <PWAUpdatePrompt />
                </>
              ) : null}
              <StatusBarSpacer />
              {resolvedRuntime.enableWebRtcShell ? (
                <>
                  <WebRTCDataRequestDialog />
                  <WebRTCPushedDataDialog />
                  <WebRTCNotifications />
                </>
              ) : null}
            </div>
          </MaybeWrap>
        </FullscreenProvider>
      </ScoutProvider>
    </ThemeProvider>
  );
}
