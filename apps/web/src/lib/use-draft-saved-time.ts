"use client";

import { toBrowserDateKey } from "@timesheet/domain";
import { useEffect, useState } from "react";

const dayMs = 24 * 60 * 60 * 1000;

export function useDraftSavedTime(iso: string | null | undefined) {
  const [formatted, setFormatted] = useState<{ iso: string; label: string; timestamp: string } | null>(null);

  useEffect(() => {
    if (!iso) return;
    const date = new Date(iso);
    const savedMs = date.getTime();
    if (!Number.isFinite(savedMs)) return;

    const time = date.toLocaleTimeString("ko-KR", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit" });
    const exact = { iso, timestamp: `${toBrowserDateKey(date).replaceAll("-", "/")} ${time}` };
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      const elapsed = Math.max(0, Date.now() - savedMs);
      const days = Math.floor(elapsed / dayMs);
      setFormatted({ ...exact, label: days > 0 ? `${days}일 전` : time.slice(0, 5) });
      timer = setTimeout(update, dayMs - (elapsed % dayMs));
    }

    update();
    return () => clearTimeout(timer);
  }, [iso]);

  return formatted?.iso === iso ? formatted : null;
}
