/**
 * `getmattered-mcp link`: connect this computer to a GetMattered cloud account.
 *
 * It uses the CLI's stored sign-in (auth.ts), which goes only to the server that
 * issued it. A stored sign-in the server still accepts is kept, so a second run
 * changes nothing. Otherwise it runs the browser sign-in once.
 *
 * No relative imports, so the test can load it from src without a build.
 */
export type Account = { id: string; email?: string; name?: string };

export type LinkDeps = {
  getAccessToken: (endpoint: string, log: (line: string) => void) => Promise<string | undefined>;
  login: (endpoint: string, log: (line: string) => void) => Promise<string>;
  /** The signed-in account, or null when the server refuses the token. */
  readAccount: (endpoint: string, token: string) => Promise<Account | null>;
  log: (line: string) => void;
};

export async function link(endpoint: string, deps: LinkDeps) {
  const stored = await deps.getAccessToken(endpoint, deps.log);
  if (stored) {
    const account = await deps.readAccount(endpoint, stored);
    if (account) return { alreadyLinked: true, account };
    deps.log('the stored sign-in was refused, so it signs in again');
  }
  await deps.login(endpoint, deps.log);
  const token = await deps.getAccessToken(endpoint, deps.log);
  if (!token) throw new Error('the browser sign-in left no sign-in for this server. Run: getmattered-mcp login');
  const account = await deps.readAccount(endpoint, token);
  if (!account) throw new Error('signed in, but the server refused the new sign-in. Run: getmattered-mcp login');
  return { alreadyLinked: false, account };
}
