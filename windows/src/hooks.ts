import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Runs `task` after `delay` ms of quiet whenever `deps` change. The task receives `cancelled()`, which turns
 * true as soon as a newer run starts or the component unmounts, so stale results are never shown.
 */
export function useDebouncedTask(task: (cancelled: () => boolean) => void | Promise<void>, deps: unknown[], delay = 350) {
  const latest = useRef(task);
  latest.current = task;
  useEffect(() => {
    let dead = false;
    const timer = window.setTimeout(() => void latest.current(() => dead), delay);
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** A larger copy of the selected image for the "Before" pane. */
export function useBeforeImage(path: string | undefined, fallback: string | null | undefined, maxPixel = 900) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    setSrc(null);
    if (path) api.previewImage(path, maxPixel).then((s) => !dead && setSrc(s)).catch(() => undefined);
    return () => { dead = true; };
  }, [path, maxPixel]);
  return src ?? fallback ?? null;
}
