/**
 * Sign-in on first use, for hosts with no terminal (the Claude Desktop .mcpb sets
 * GETMATTERED_LOGIN_ON_START=1 in manifest.json).
 *
 * The browser sign-in never runs before `initialize`: a host waits only a short
 * time for a stdio server to answer it. It starts on the first `tools/call` that
 * arrives without a stored sign-in. Tool calls wait for it until it ends or
 * `waitMs` after it started, whichever comes first, so no call waits longer than
 * a host's request timeout. After that, calls go out at once even while the
 * sign-in is still open. A sign-in that fails lets the next `tools/call` try again.
 *
 * A held call that the host cancels never goes upstream: the server cannot act on
 * a request the user already gave up on.
 *
 * No imports, so the test can load it from dist without the SDK.
 */
export type LoginGateOptions = {
  enabled: boolean;
  signedIn: boolean;
  /** Runs the browser sign-in and returns the new access token, or undefined. */
  login: () => Promise<string | undefined>;
  /** Called once with the token, so later requests carry it. */
  onToken: (token: string) => void;
  log: (line: string) => void;
  waitMs: number;
};

type RequestId = string | number;
type Attempt = { settled: Promise<void>; waitOver: boolean };

export function createLoginGate(options: LoginGateOptions) {
  let signedIn = options.signedIn;
  let attempt: Attempt | null = null;
  const held = new Set<RequestId>();

  const signIn = async () => {
    try {
      const token = await options.login();
      if (token) {
        signedIn = true;
        options.onToken(token);
        options.log('signed in');
      } else {
        options.log('sign-in returned no token. Run: getmattered-mcp login');
      }
    } catch (error: unknown) {
      options.log(`sign-in failed (${String(error)}). The next tool call tries again.`);
    }
  };

  const start = () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current: Attempt = { settled: Promise.resolve(), waitOver: false };
    attempt = current;
    const waitEnds = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        current.waitOver = true;
        resolve();
      }, options.waitMs);
    });
    const signed = signIn().finally(() => {
      clearTimeout(timer);
      if (attempt === current) attempt = null;
    });
    current.settled = Promise.race([signed, waitEnds]);
    return current;
  };

  return {
    /**
     * What request `id` with this method waits for before it goes upstream: null
     * to send it now, or a promise that settles true when it may go and false when
     * the host cancelled it meanwhile.
     */
    hold(method: string, id: RequestId): Promise<boolean> | null {
      if (!options.enabled || signedIn || method !== 'tools/call') return null;
      const current = attempt ?? start();
      if (current.waitOver) return null;
      held.add(id);
      return current.settled.then(() => held.delete(id));
    },
    /** True when `id` was held here: it is dropped, and the caller sends nothing. */
    cancel(id: RequestId): boolean {
      return held.delete(id);
    },
    get signedIn() {
      return signedIn;
    },
  };
}
