import { useState, useCallback, useEffect, useRef } from 'react';
import type { DailyEntry } from '@/lib/types';
import { computeEntryStatus } from '@/lib/admin-settings';

const STORAGE_KEY_DAILY_ENTRIES = 'coordinator_daily_entries';
/** Fired after a write, so every mounted copy of this hook re-reads. */
const CHANGE_EVENT = 'crm:daily-entries-changed';

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_DAILY_ENTRIES);
  } catch {
    return null;
  }
}

export function useDailyEntries() {
  const initial = readSaved();
  const [entries, setEntries] = useState<DailyEntry[]>(() => {
    try {
      if (initial) {
        const parsed = JSON.parse(initial);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load daily entries from localStorage', e);
    }
    return []; // Clean slate: 0 dummy data
  });
  /** What this copy last wrote or read, so an echo of its own write is ignored. */
  const lastSeenRef = useRef<string | null>(initial);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const json = JSON.stringify(entries);
      if (json === lastSeenRef.current) return;
      localStorage.setItem(STORAGE_KEY_DAILY_ENTRIES, json);
      lastSeenRef.current = json;
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch (e) {
      console.error('Failed to save daily entries to localStorage', e);
    }
  }, [entries]);

  // Several screens hold a copy of this hook at once - the entry form, the
  // dashboard banner, the robot - and an entry logged on one must show on the
  // others straight away.
  useEffect(() => {
    const reload = () => {
      const saved = readSaved();
      if (saved === null || saved === lastSeenRef.current) return;
      try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return;
        lastSeenRef.current = saved;
        setEntries(parsed);
      } catch {
        // Corrupt value: keep what we have.
      }
    };
    window.addEventListener(CHANGE_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(CHANGE_EVENT, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  // The threshold comes from Settings; the rule itself lives in one place.
  const computeStatus = (entry: Partial<DailyEntry>) => computeEntryStatus(entry);

  const addEntry = useCallback(async (entry: Partial<DailyEntry>) => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const status = computeStatus(entry);
    const newEntry: DailyEntry = {
      ...entry,
      overall_status: status,
      id: entry.id || `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as DailyEntry;

    setEntries((prev) => {
      const existingIdx = prev.findIndex(
        (e) => e.employee_id === entry.employee_id && e.entry_date === entry.entry_date
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], ...newEntry };
        return copy;
      }
      return [newEntry, ...prev];
    });
    setIsLoading(false);
    return newEntry;
  }, []);

  const updateEntry = useCallback(async (id: string, updates: Partial<DailyEntry>) => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          const updated = { ...e, ...updates };
          updated.overall_status = computeStatus(updated);
          return updated;
        }
        return e;
      })
    );
    setIsLoading(false);
  }, []);

  const getEntryByDate = useCallback(
    (employeeId: string, date: string) => {
      return entries.find((e) => e.employee_id === employeeId && e.entry_date === date) || null;
    },
    [entries]
  );

  const getMyEntries = useCallback(
    (employeeId: string, startDate?: string, endDate?: string) => {
      return entries.filter((e) => {
        if (e.employee_id !== employeeId) return false;
        if (startDate && e.entry_date < startDate) return false;
        if (endDate && e.entry_date > endDate) return false;
        return true;
      });
    },
    [entries]
  );

  return { entries, addEntry, updateEntry, getEntryByDate, getMyEntries, isLoading };
}
