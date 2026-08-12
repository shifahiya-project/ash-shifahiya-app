import { mergeProgress, normalizeProgress } from "./merge-progress";
import { progressStore, type Progress } from "./progress-store";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSyncConfigured } from "./supabase-config";

// Cross-device progress. localStorage stays the source of truth — the course
// has to keep working offline and without an account — and the server holds a
// copy that other devices merge with. Signing in never replaces local work: a
// pull merges both sides and writes the result back to both.

export type SyncStatus =
  | "off" // no Supabase project configured
  | "signed-out"
  | "signed-in"
  | "working"; // signing in, pulling or pushing

export type SyncState = {
  status: SyncStatus;
  email: string | null;
  /** Something to show the learner: an error, or a confirmation. */
  message: string | null;
  syncedAt: number | null;
};

// A push carries the learner's whole history, so it must not follow every
// answer. Changes settle for a few seconds first, and a long study session is
// still cut off at the cap so nothing sits unsaved for minutes.
const SETTLE_MS = 8_000;
const MAX_WAIT_MS = 60_000;

const OFF: SyncState = { status: "off", email: null, message: null, syncedAt: null };

const listeners = new Set<() => void>();
let state: SyncState = isSyncConfigured
  ? { status: "signed-out", email: null, message: null, syncedAt: null }
  : OFF;

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const syncStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): SyncState {
    return state;
  },
  getServerSnapshot(): SyncState {
    return OFF;
  },
};

// supabase-js is far bigger than the course itself, so it is never part of the
// entry chunk: the module arrives only once a learner actually signs in.
type Client = Awaited<ReturnType<typeof createClient>>;
let clientPromise: Promise<Client> | null = null;

async function createClient() {
  const { createClient: create } = await import("@supabase/supabase-js");
  return create(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function client() {
  clientPromise ??= createClient();
  return clientPromise;
}

/** Supabase reports failures as values rather than throwing. */
function describe(error: { message: string } | null) {
  return error ? error.message : null;
}

async function currentUser() {
  const { data } = await (await client()).auth.getSession();
  return data.session?.user ?? null;
}

/**
 * Merges the stored copy with what this device knows and writes the result
 * both ways, so neither side loses anything it had alone.
 */
let reconciling = false;

async function reconcile() {
  const supabase = await client();
  const user = await currentUser();
  if (!user) return;

  reconciling = true;
  setState({ status: "working" });
  const { data, error } = await supabase
    .from("progress")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    reconciling = false;
    setState({ status: "signed-in", message: `Не удалось прочитать прогресс: ${error.message}` });
    return;
  }

  const local = progressStore.getSnapshot();
  const merged = data ? mergeProgress(local, normalizeProgress(data.data as Partial<Progress>)) : local;
  // Writing the merge back notifies the store, which would otherwise queue a
  // push of what is about to be pushed here anyway.
  progressStore.replaceAll(merged);
  reconciling = false;
  cancelPending();

  const failure = await write(merged);
  setState({
    status: "signed-in",
    email: user.email ?? null,
    message: failure ? `Не удалось сохранить прогресс: ${failure}` : null,
    syncedAt: failure ? state.syncedAt : Date.now(),
  });
}

async function write(progress: Progress) {
  const supabase = await client();
  const user = await currentUser();
  if (!user) return "нет активного входа";

  const { error } = await supabase
    .from("progress")
    .upsert({ user_id: user.id, data: progress }, { onConflict: "user_id" });
  return describe(error);
}

let settleTimer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;

function cancelPending() {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
  firstPendingAt = 0;
}

async function flush() {
  cancelPending();
  if (state.status === "off" || !(await currentUser())) return;
  const failure = await write(progressStore.getSnapshot());
  setState(
    failure
      ? { message: `Не удалось сохранить прогресс: ${failure}` }
      : { message: null, syncedAt: Date.now() },
  );
}

function schedulePush() {
  if (state.status === "off") return;
  firstPendingAt ||= Date.now();
  const waited = Date.now() - firstPendingAt;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(flush, Math.min(SETTLE_MS, Math.max(0, MAX_WAIT_MS - waited)));
}

let started = false;

/**
 * Wires the store to Supabase. Safe to call on every mount — only the first
 * call does anything, and it does nothing at all without a configured project.
 */
export function startSync() {
  if (started || !isSyncConfigured || typeof window === "undefined") return;
  started = true;

  void (async () => {
    const supabase = await client();
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setState({ status: "signed-in", email: session.user.email ?? null });
        void reconcile();
      } else {
        cancelPending();
        setState({ status: "signed-out", email: null, syncedAt: null });
      }
    });

    // A magic link lands back on the page with the session in the URL, which
    // the client above picks up; getSession also restores an earlier visit.
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setState({ status: "signed-in", email: data.session.user.email ?? null });
      await reconcile();
    }
  })();

  progressStore.subscribe(() => {
    if (state.status === "signed-in" && !reconciling) schedulePush();
  });

  // Closing the tab mid-lesson must not drop the last few answers.
  window.addEventListener("pagehide", () => {
    if (settleTimer) void flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && settleTimer) void flush();
  });
}

/**
 * Sends the browser to Google and back. Sign-in deliberately goes through a
 * provider rather than an emailed link: Supabase's built-in mail is capped at
 * a couple of messages an hour, which a shared course would hit immediately.
 */
export async function signInWithGoogle() {
  if (!isSyncConfigured) return;
  setState({ status: "working", message: null });
  const supabase = await client();
  // Google must return to this exact page; the client picks the session out of
  // the URL it lands on.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  // A successful call navigates away, so reaching here at all means it failed.
  if (error) setState({ status: "signed-out", message: `Не удалось начать вход: ${error.message}` });
}

export async function signOut() {
  if (!isSyncConfigured) return;
  setState({ status: "working" });
  await flush();
  await (await client()).auth.signOut();
  setState({ status: "signed-out", email: null, message: "Вы вышли. Прогресс остался на этом устройстве.", syncedAt: null });
}

/** Manual "sync now", for when the learner does not want to wait. */
export async function syncNow() {
  if (state.status === "off") return;
  await reconcile();
}
