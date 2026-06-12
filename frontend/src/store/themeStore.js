import { create } from 'zustand';

const getInitialTheme = () => localStorage.getItem('pb365_theme') || 'dark';

const useThemeStore = create((set) => ({
  theme: getInitialTheme(),

  toggleTheme: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('pb365_theme', next);
      document.documentElement.classList.toggle('light', next === 'light');
      return { theme: next };
    });
  },

  initTheme: () => {
    const saved = getInitialTheme();
    document.documentElement.classList.toggle('light', saved === 'light');
  },
}));

export default useThemeStore;
