import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ThemeColors } from './colors';

export type ThemePreference = 'automatic' | 'light' | 'dark';

interface ThemeContextType {
  colors: ThemeColors;
  theme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@theme_preference';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'automatic') {
          setPreferenceState(stored);
        } else {
          setPreferenceState('dark');
        }
      } catch (error) {
        console.error('Failed to load theme preference', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadPreference();
  }, []);

  const setPreference = useCallback(async (pref: ThemePreference) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
      setPreferenceState(pref);
    } catch (error) {
      console.error('Failed to save theme preference', error);
    }
  }, []);

  const currentTheme = useMemo(() => {
    if (preference === 'automatic') {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemColorScheme]);

  const toggleTheme = useCallback(async () => {
    const next: ThemePreference = currentTheme === 'dark' ? 'light' : 'dark';
    await setPreference(next);
  }, [currentTheme, setPreference]);

  const colors = currentTheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ colors, theme: currentTheme, preference, setPreference, toggleTheme }),
    [colors, currentTheme, preference, setPreference, toggleTheme]
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        document.head.appendChild(metaThemeColor);
      }
      metaThemeColor.setAttribute('content', colors.background);

      let metaColorScheme = document.querySelector('meta[name="color-scheme"]');
      if (!metaColorScheme) {
        metaColorScheme = document.createElement('meta');
        metaColorScheme.setAttribute('name', 'color-scheme');
        document.head.appendChild(metaColorScheme);
      }
      metaColorScheme.setAttribute('content', currentTheme);

      if (typeof document !== 'undefined') {
        document.documentElement.style.backgroundColor = colors.background;
        document.documentElement.style.colorScheme = currentTheme;
        if (document.body) {
          document.body.style.backgroundColor = colors.background;
          document.body.style.colorScheme = currentTheme;
        }
      }
    }
  }, [colors.background, currentTheme]);

  if (!isLoaded) {
    return null; // or a splash screen
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
};
