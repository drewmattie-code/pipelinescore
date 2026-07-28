// Docs-example placeholders that people copy-paste verbatim. A real submission
// genuinely arrived as "yourusername" — someone ran the benchmark on their own
// RTX 3070 and pasted the example command straight out of the README.
//
// Normalized to anonymous rather than rejected so older CLIs keep working.
// The CLI blocks the same list client-side (cli/src/util.ts — keep in sync).
//
// Lives here rather than in the submissions route because the boot-time scrub
// in seed.ts applies the same list retroactively to rows that predate the check.
export const PLACEHOLDER_NICKNAMES = new Set([
  'yourusername', 'your-username', 'your_username', 'yourname', 'your-name', 'your_name',
  'your-handle', 'your_handle', 'yourhandle', 'your-nickname', 'username', 'nickname',
  'handle', 'user', 'changeme', 'change-me', 'anonymous', 'anon', 'example', 'test-user',
  'admin', 'root', 'moderator', 'official', 'staff', 'pipelinescore',
]);

export function isPlaceholderNickname(nickname: string | null | undefined): boolean {
  return !!nickname && PLACEHOLDER_NICKNAMES.has(nickname.toLowerCase());
}
