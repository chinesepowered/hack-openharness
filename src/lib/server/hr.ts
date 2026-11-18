import 'server-only'; // importing this from a client component fails the build
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessRouter } from './harnessrouter';

/** HR_API_KEY from the server environment, else the one-line .env.harnessrouter (local dev). */
function hrApiKey(): string {
  const env = process.env.HR_API_KEY?.trim();
  if (env) return env;
  const lines = readFileSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ process.cwd(), '.env.harnessrouter'), 'utf8').split('\n').filter((l) => l.trim());
  if (lines.length !== 1 || !lines[0].startsWith('HR_API_KEY=')) {
    throw new Error('HarnessRouter key file must hold one HR_API_KEY line');
  }
  return lines[0].slice('HR_API_KEY='.length).trim();
}

const g = globalThis as unknown as { __ohHR?: HarnessRouter };

/** The process-wide HarnessRouter client. The key never leaves this module's closure. */
export function hr(): HarnessRouter {
  return (g.__ohHR ??= new HarnessRouter({ apiKey: hrApiKey() }));
}
