import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderGameCompatibilityShell } from '@/core/testing/game-compatibility/renderGameCompatibilityShell';
import { gameCompatibilitySelectors } from '@/game-template/testing/compatibilityManifest';

describe('editable yearly layer - match scouting flow', () => {
  it('starts with a season-owned scout options bucket', async () => {
    const user = userEvent.setup();

    await renderGameCompatibilityShell({
      initialEntries: ['/game-start'],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Scout Options' }),
    );

    expect(
      await screen.findByTestId(gameCompatibilitySelectors.scoutOptions),
    ).toBeVisible();
    expect(await screen.findByText('Game placeholder option A')).toBeVisible();
  });
});
