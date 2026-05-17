import { render, type RenderResult } from '@testing-library/react';
import {
  FrameworkShell,
  createFrameworkRouter,
  type CreateFrameworkRouterOptions,
  type FrameworkShellRuntimeOptions,
} from '@/core/app/frameworkShell';
import {
  emptyStateFixture,
  loadTestHarnessFixture,
  type TestHarnessFixture,
} from './fixtures';
import { createOfflineController, type OfflineController } from './network';

export interface RenderFrameworkShellOptions {
  fixture?: TestHarnessFixture;
  initialEntries?: string[];
  online?: boolean;
  runtime?: Partial<FrameworkShellRuntimeOptions>;
  routerOptions?: Omit<CreateFrameworkRouterOptions, 'initialEntries' | 'kind'>;
}

export interface RenderFrameworkShellResult extends RenderResult {
  offlineController: OfflineController;
  router: ReturnType<typeof createFrameworkRouter>;
}

export async function renderFrameworkShell({
  fixture = emptyStateFixture,
  initialEntries = ['/'],
  online = true,
  runtime,
  routerOptions,
}: RenderFrameworkShellOptions = {}): Promise<RenderFrameworkShellResult> {
  const offlineController = createOfflineController();
  offlineController.setOnline(online);
  await loadTestHarnessFixture(fixture);

  const router = createFrameworkRouter({
    kind: 'memory',
    initialEntries,
    ...routerOptions,
  });

  return {
    ...render(
      <FrameworkShell
        router={router}
        runtime={{
          showSplashScreen: false,
          enablePwaPrompts: false,
          enableWebRtcShell: false,
          trackPwaLifecycle: false,
          enableDebugGlobals: false,
          ...runtime,
        }}
      />,
    ),
    offlineController,
    router,
  };
}
