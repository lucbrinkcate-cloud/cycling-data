import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AthleteSettings } from '../lib/settings';

/**
 * React binding for the persisted athlete profile. Keeps every consumer in
 * sync by listening for `storage` events (e.g. settings changed elsewhere).
 */
export function useAthleteSettings(): [AthleteSettings, (next: AthleteSettings) => void] {
  const [settings, setSettings] = useState<AthleteSettings>(() =>
    typeof window === 'undefined' ? { ...DEFAULT_SETTINGS } : loadSettings(),
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'route-reel:athlete-settings:v1' || e.key == null) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((next: AthleteSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  return [settings, update];
}
