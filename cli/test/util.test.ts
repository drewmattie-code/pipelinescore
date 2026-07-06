/**
 * Run with: npm test
 * Pure-function assertions for the shared CLI helpers.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliVersion, isPlaceholderNickname, normalizeLocalEndpoint } from '../src/util.js';

let failures = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  if (!ok) failures += 1;
}

// endpoint normalization: bare origins get /v1, explicit paths are respected
eq('bare ollama origin', normalizeLocalEndpoint('http://localhost:11434'), 'http://localhost:11434/v1');
eq('bare origin trailing slash', normalizeLocalEndpoint('http://localhost:1234/'), 'http://localhost:1234/v1');
eq('already /v1', normalizeLocalEndpoint('http://localhost:1234/v1'), 'http://localhost:1234/v1');
eq('already /v1 trailing slash', normalizeLocalEndpoint('http://localhost:1234/v1/'), 'http://localhost:1234/v1');
eq('custom path untouched', normalizeLocalEndpoint('http://gw.local:8080/openai/v1'), 'http://gw.local:8080/openai/v1');
eq('remote host bare', normalizeLocalEndpoint('http://100.106.28.74:8094'), 'http://100.106.28.74:8094/v1');
eq('not a url passes through', normalizeLocalEndpoint('not-a-url'), 'not-a-url');

// placeholder nicknames: the exact string a real user submitted, plus kin
eq('yourusername blocked', isPlaceholderNickname('yourusername'), true);
eq('your-handle blocked', isPlaceholderNickname('your-handle'), true);
eq('YOUR-HANDLE blocked (case)', isPlaceholderNickname('YOUR-HANDLE'), true);
eq('changeme blocked', isPlaceholderNickname('changeme'), true);
eq('admin blocked', isPlaceholderNickname('admin'), true);
eq('real nickname allowed', isPlaceholderNickname('drew'), false);
eq('real nickname allowed 2', isPlaceholderNickname('quant-or-die'), false);

// cliVersion matches package.json exactly (banner/--version/cli_version can't drift)
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
eq('cliVersion() reads package.json', cliVersion(), pkg.version);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
