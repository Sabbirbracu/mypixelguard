import { useEffect, useRef } from "react";

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
