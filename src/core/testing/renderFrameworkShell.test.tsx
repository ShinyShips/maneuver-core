import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderFrameworkShell } from './renderFrameworkShell';

describe('renderFrameworkShell', () => {
  it('renders a transfer surface through a memory-backed framework shell', async () => {
    await renderFrameworkShell({
      initialEntries: ['/json-transfer'],
    });

    expect(
      await screen.findByRole('heading', { name: 'JSON Data Transfer' }),
    ).toBeInTheDocument();
  });
});
