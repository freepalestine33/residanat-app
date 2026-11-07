import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored));
      }
    } catch (err) {
      console.error(`Failed to load ${key} from localStorage:`, err);
    } finally {
      setLoaded(true);
    }
  }, [key]);

  const setStoredValue = (newValue: T) => {
    setValue(newValue);
    try {
      localStorage.setItem(key, JSON.stringify(newValue));
    } catch (err) {
      console.error(`Failed to save ${key} to localStorage:`, err);
    }
  };

  return [value, setStoredValue, loaded] as const;
}
