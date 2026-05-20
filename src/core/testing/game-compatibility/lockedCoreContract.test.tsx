import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderGameCompatibilityShell } from '@/core/testing/game-compatibility/renderGameCompatibilityShell';
import {
  gameCompatibilityBindings,
  gameCompatibilityContractFixture,
  gameCompatibilitySelectors,
} from '@/game-template/testing/compatibilityManifest';

describe('locked core contract layer', () => {
  it('defines the required yearly bindings for the framework shell', () => {
    expect(gameCompatibilityBindings.config.year).toBeGreaterThan(0);
    expect(gameCompatibilityBindings.config.gameName).not.toHaveLength(0);
    expect(
      gameCompatibilityBindings.scoring.calculateTotalPoints(
        gameCompatibilityContractFixture.entry,
      ),
    ).toBeGreaterThan(0);
    expect(
      gameCompatibilityBindings.analysis.calculateBasicStats([
        gameCompatibilityContractFixture.entry,
      ]),
    ).toMatchObject({
      teamNumber: gameCompatibilityContractFixture.entry.teamNumber,
      matchCount: 1,
    });
    expect(
      gameCompatibilityBindings.validation.getDataCategories(),
    ).toContain('endgame');
    expect(
      gameCompatibilityBindings.validation.getDefaultConfig(),
    ).toHaveProperty('thresholds');
    expect(
      gameCompatibilityBindings.transformation.transformActionsToCounters(
        gameCompatibilityContractFixture.matchData,
      ),
    ).toEqual(gameCompatibilityContractFixture.entry.gameData);
  });

  it('boots the framework shell with the yearly compatibility manifest', async () => {
    await renderGameCompatibilityShell();

    expect(await screen.findByText('Version')).toBeVisible();
  });

  it('renders a minimal compatibility path through the framework shell', async () => {
    const pitScouting = await renderGameCompatibilityShell({
      initialEntries: ['/pit-scouting'],
    });

    expect(
      await screen.findByTestId(gameCompatibilitySelectors.pitScoutingQuestions),
    ).toBeVisible();

    pitScouting.unmount();

    await renderGameCompatibilityShell({
      initialEntries: ['/endgame'],
    });

    expect(
      await screen.findByTestId(gameCompatibilitySelectors.statusToggles),
    ).toBeVisible();
  });
});
