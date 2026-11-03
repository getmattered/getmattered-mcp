/**
 * Tool ids are `getmattered_<suffix>`. The hosted server may also list
 * `mattered_<suffix>`, and saved scripts may use `aiapplyd_<suffix>`. `call` accepts
 * any of the three prefixes and runs the name the server actually lists. A name
 * the server no longer lists, such as a combined tool from 1.10.1 or earlier, is
 * passed through unchanged and the server runs it as the tool that does that
 * operation now.
 */
export const TOOL_PREFIXES = ['getmattered_', 'aiapplyd_', 'mattered_'] as const;

/** The listed tool a requested name stands for, or the name unchanged. */
export function resolveToolName(requested: string, listed: readonly string[]) {
  if (listed.includes(requested)) return requested;
  const prefix = TOOL_PREFIXES.find(candidate => requested.startsWith(candidate));
  if (!prefix) return requested;
  const suffix = requested.slice(prefix.length);
  for (const candidate of TOOL_PREFIXES) {
    if (listed.includes(`${candidate}${suffix}`)) return `${candidate}${suffix}`;
  }
  return requested;
}
