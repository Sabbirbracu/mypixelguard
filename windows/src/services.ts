// Update check, opt-in anonymous usage stats and feedback. Port of AppServices.swift: same rules, same storage keys.
// The requests themselves are made by src-tauri/src/services.rs, which fixes the host and the exact fields sent.
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { currentLanguage } from "./i18n";
import type { Tool } from "./types";

const Key = {
  launches: "app.launches",
  checkUpdates: "updates.check",
  dismissedUpdate: "updates.dismissed",
  shareUsage: "usage.share",
  consentAsked: "usage.asked",
  installID: "usage.id",
  pending: "usage.pending",
  lastReport: "usage.lastReport",
  feedbackAt: "feedback.askAt",
  feedbackDone: "feedback.done",
  feedbackQueue: "feedback.queue",
} as const;
const REPORT_INTERVAL = 7 * 24 * 3600 * 1000;
const FIRST_FEEDBACK_AT = 5;

// Every access is guarded: storage can be unavailable.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export interface UpdateInfo { version: string; url: string; notes: string }
interface Manifest { version: string; url: string; notes: Record<string, string>; current: string }
interface FeedbackBody { rating: number; text: string; lang: string }

export function isNewer(a: string, b: string): boolean {
  const x = a.split(".").map((n) => parseInt(n, 10) || 0), y = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = x[i] ?? 0, r = y[i] ?? 0;
    if (l !== r) return l > r;
  }
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let launched = false;

interface ServicesState {
  update: UpdateInfo | null;
  showConsent: boolean;
  showFeedback: boolean;
  checkUpdates: boolean;
  shareUsage: boolean;
  pending: Record<string, number>;

  appLaunched: () => Promise<void>;
  setCheckUpdates: (on: boolean) => void;
  setShareUsage: (on: boolean) => void;
  checkForUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  answerConsent: (yes: boolean) => void;
  recordSave: (tool: Tool, succeeded: boolean) => void;
  openFeedback: () => void;
  closeFeedback: () => void;
  feedbackLater: () => void;
  feedbackNever: () => void;
  sendFeedback: (rating: number, text: string) => Promise<void>;
}

export const useServices = create<ServicesState>((set, get) => {
  const bump = (key: string) => {
    const pending = { ...read<Record<string, number>>(Key.pending, {}) };
    pending[key] = (pending[key] ?? 0) + 1;
    write(Key.pending, pending);
    set({ pending });
  };

  const sendReportIfDue = async () => {
    const id = read<string | null>(Key.installID, null);
    if (!get().shareUsage || !id) return;
    const last = read<number>(Key.lastReport, Date.now());
    if (Date.now() - last < REPORT_INTERVAL) return;
    const pending = read<Record<string, number>>(Key.pending, {});
    const tools: Record<string, number> = {};
    for (const [k, v] of Object.entries(pending)) if (k.startsWith("tool.")) tools[k.slice(5)] = v;
    const stats = {
      id, lang: currentLanguage(), days: Math.floor((Date.now() - last) / 86400000),
      opens: pending.opens ?? 0, saved: pending.saved ?? 0, failed: pending.failed ?? 0, tools,
    };
    const ok = await invoke<boolean>("service_send_stats", { stats }).catch(() => false);
    if (!ok) return; // offline: keep counting, try again next launch
    write(Key.pending, undefined);
    write(Key.lastReport, Date.now());
    set({ pending: {} });
  };

  const sendQueuedFeedback = async () => {
    const queue = read<FeedbackBody[]>(Key.feedbackQueue, []);
    while (queue.length && (await invoke<boolean>("service_send_feedback", { feedback: queue[0] }).catch(() => false))) queue.shift();
    write(Key.feedbackQueue, queue);
  };

  return {
    update: null,
    showConsent: false,
    showFeedback: false,
    checkUpdates: read<boolean>(Key.checkUpdates, true),
    shareUsage: read<boolean>(Key.shareUsage, false),
    pending: read<Record<string, number>>(Key.pending, {}),

    /** Called once per app launch. Nothing is sent before the user has answered the consent question. */
    appLaunched: async () => {
      if (launched) return;
      launched = true;
      const count = read<number>(Key.launches, 0) + 1;
      write(Key.launches, count);
      if (get().shareUsage) bump("opens");

      if (!read<boolean>(Key.consentAsked, false)) {
        await sleep(1200);
        set({ showConsent: true });
      } else if (!read<boolean>(Key.feedbackDone, false) && count >= read<number>(Key.feedbackAt, FIRST_FEEDBACK_AT)) {
        await sleep(2000);
        set({ showFeedback: true });
      }
      await sendQueuedFeedback();
      await sendReportIfDue();
      await get().checkForUpdate();
    },

    setCheckUpdates: (on) => {
      write(Key.checkUpdates, on);
      set({ checkUpdates: on });
      if (on) void get().checkForUpdate();
      else set({ update: null });
    },

    setShareUsage: (on) => {
      write(Key.shareUsage, on);
      if (on) {
        if (!read<string | null>(Key.installID, null)) write(Key.installID, crypto.randomUUID());
        if (read<number | null>(Key.lastReport, null) == null) write(Key.lastReport, Date.now());
      } else {
        // Turning it off forgets everything collected so far, including the random id.
        write(Key.pending, undefined);
        write(Key.installID, undefined);
        write(Key.lastReport, undefined);
      }
      set({ shareUsage: on, pending: on ? read(Key.pending, {}) : {} });
    },

    checkForUpdate: async () => {
      if (!get().checkUpdates) return;
      const m = await invoke<Manifest | null>("service_update_manifest").catch(() => null);
      if (!m || !isNewer(m.version, m.current) || read<string | null>(Key.dismissedUpdate, null) === m.version) {
        set({ update: null });
        return;
      }
      set({ update: { version: m.version, url: m.url, notes: m.notes[currentLanguage()] ?? "" } });
    },

    dismissUpdate: () => {
      const v = get().update?.version;
      if (v) write(Key.dismissedUpdate, v);
      set({ update: null });
    },

    answerConsent: (yes) => {
      write(Key.consentAsked, true);
      get().setShareUsage(yes);
      set({ showConsent: false });
    },

    /** Counts one finished save (or failure) for a tool. Nothing is kept unless the user agreed to share. */
    recordSave: (tool, succeeded) => {
      if (!get().shareUsage) return;
      bump(succeeded ? "saved" : "failed");
      if (succeeded) bump(`tool.${tool}`);
    },

    openFeedback: () => set({ showFeedback: true }),
    closeFeedback: () => set({ showFeedback: false }),
    feedbackLater: () => {
      write(Key.feedbackAt, read<number>(Key.launches, 0) + 10);
      set({ showFeedback: false });
    },
    feedbackNever: () => {
      write(Key.feedbackDone, true);
      set({ showFeedback: false });
    },

    /** Sends now, or keeps it and sends on a later launch when there is no connection. Either way the user is done. */
    sendFeedback: async (rating, text) => {
      write(Key.feedbackDone, true);
      const body: FeedbackBody = { rating, text, lang: currentLanguage() };
      if (await invoke<boolean>("service_send_feedback", { feedback: body }).catch(() => false)) return;
      write(Key.feedbackQueue, [...read<FeedbackBody[]>(Key.feedbackQueue, []), body].slice(-5));
    },
  };
});
