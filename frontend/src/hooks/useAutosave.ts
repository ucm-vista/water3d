import { useEffect, useRef } from "react";

// Debounced autosave. Persists `value` via `onSave` shortly after it stops
// changing, but only when it actually differs from the last-saved snapshot
// (`saved`). Any edit still pending when the component unmounts (e.g. switching
// fields or leaving the page) is flushed immediately so nothing is lost.
export function useAutosave<T>(value: T, saved: T, onSave: (value: T) => void, delayMs = 600): void {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const valueRef = useRef(value);
  valueRef.current = value;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const pendingRef = useRef(false);

  useEffect(() => {
    if (JSON.stringify(value) === JSON.stringify(saved)) {
      pendingRef.current = false;
      return;
    }
    pendingRef.current = true;
    const timer = setTimeout(() => {
      pendingRef.current = false;
      onSaveRef.current(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, saved, delayMs]);

  useEffect(() => {
    return () => {
      if (pendingRef.current && JSON.stringify(valueRef.current) !== JSON.stringify(savedRef.current)) {
        onSaveRef.current(valueRef.current);
      }
    };
  }, []);
}
