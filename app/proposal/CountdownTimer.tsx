"use client";

import { useEffect, useState } from "react";

function getTimeLeft(deadline: string): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const diff = Math.max(0, new Date(deadline).getTime() - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function CountdownTimer({ deadline }: { deadline: string }) {
  const [time, setTime] = useState(getTimeLeft(deadline));

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return (
    <div className="mt-4 flex gap-4">
      {[
        { label: "Days", value: time.days },
        { label: "Hours", value: time.hours },
        { label: "Minutes", value: time.minutes },
        { label: "Seconds", value: time.seconds },
      ].map(({ label, value }) => (
        <div key={label} className="text-center">
          <div className="text-4xl font-bold tabular-nums text-orange-400">{String(value).padStart(2, "0")}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</div>
        </div>
      ))}
    </div>
  );
}
