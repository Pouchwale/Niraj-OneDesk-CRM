import { useCallback, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  getSettings,
  subscribeToSettings,
  updateSettings,
  type AdminSettings,
} from '@/lib/admin-settings';

export type { AdminSettings };

/** The persisted operational settings, re-rendered whenever they change. */
export function useAdminSettings() {
  const settings = useSyncExternalStore(subscribeToSettings, getSettings, getSettings);

  const updateSetting = useCallback(<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    updateSettings({ [key]: value } as Partial<AdminSettings>);
    toast.success('Setting saved');
  }, []);

  return {
    settings,
    updateSetting,
    isLoading: false,
  };
}
