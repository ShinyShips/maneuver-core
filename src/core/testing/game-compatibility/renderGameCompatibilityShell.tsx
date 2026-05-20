import {
  renderFrameworkShell,
  type RenderFrameworkShellOptions,
} from '@/core/testing/renderFrameworkShell';
import type { FrameworkGameBindings } from '@/core/app/frameworkShell';
import { gameCompatibilityBindings } from '@/game-template/testing/compatibilityManifest';

export interface RenderGameCompatibilityShellOptions
  extends Omit<RenderFrameworkShellOptions, 'routerOptions'> {
  routerOptions?: Omit<
    NonNullable<RenderFrameworkShellOptions['routerOptions']>,
    'gameBindings'
  >;
}

export function renderGameCompatibilityShell(
  options: RenderGameCompatibilityShellOptions = {},
) {
  return renderFrameworkShell({
    ...options,
    routerOptions: {
      ...options.routerOptions,
      gameBindings: gameCompatibilityBindings as FrameworkGameBindings,
    },
  });
}
