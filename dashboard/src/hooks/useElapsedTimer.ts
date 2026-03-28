import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/utils";

/**
 * Live elapsed time counter. Ticks every second while active.
 * Returns elapsed milliseconds and a formatted string.
 */
export function useElapsedTimer(
  startTime: string | null | undefined,
  isActive: boolean,
): { elapsed: number; formatted: string } {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!isActive || !startTime) {
      setElapsed(0);
      return;
    }

    const startMs = new Date(startTime).getTime();
    if (isNaN(startMs)) {
      setElapsed(0);
      return;
    }

    const tick = () => {
      const diff = Date.now() - startMs;
      setElapsed(diff > 0 ? diff : 0);
    };

    tick(); // immediate first tick
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [startTime, isActive]);

  if (!isActive || !startTime || elapsed <= 0) {
    return { elapsed: 0, formatted: "—" };
  }

  return { elapsed, formatted: formatDuration(elapsed) };
}
