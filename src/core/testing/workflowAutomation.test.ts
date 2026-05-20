import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

async function readWorkflow(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('repository workflow automation', () => {
  it('keeps the PR lane wired to pull requests', async () => {
    const workflow = await readWorkflow('.github\\workflows\\pr-lane.yml');

    expect(workflow).toContain('name: PR lane');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('run: npm run test:pr');
  });

  it('defines a Heavy confidence lane with scheduled and manual runs', async () => {
    const workflow = await readWorkflow('.github\\workflows\\heavy-confidence-lane.yml');

    expect(workflow).toContain('name: Heavy confidence lane');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('run: npm run test:heavy');
  });
});
