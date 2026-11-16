import { useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`cd:${key}`);
      if (saved) {
        const parsed = JSON.parse(saved) as T;
        setValue((current) => (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null ? parsed : { ...current, ...parsed }) as T);
      }
    } catch {
      // A damaged local value should not block the studio.
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(`cd:${key}`, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private browsing; session state still works.
    }
  }, [key, ready, value]);
  return [value, setValue, ready] as const;
}
