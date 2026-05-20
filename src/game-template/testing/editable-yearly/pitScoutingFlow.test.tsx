import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderGameCompatibilityShell } from '@/core/testing/game-compatibility/renderGameCompatibilityShell';

describe('editable yearly layer - pit scouting flow', () => {
  it('starts with a season-owned pit scouting questions bucket', async () => {
    await renderGameCompatibilityShell({
      initialEntries: ['/pit-scouting'],
    });

    expect(
      await screen.findByText('Game-Specific Implementation Needed'),
    ).toBeVisible();
    expect(
      await screen.findByText('Add questions specific to your game year'),
    ).toBeVisible();
  });
});
