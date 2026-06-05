import useThemeStore from '../store/themeStore';

const useTheme = () => {
  const { theme, toggleTheme, initTheme } = useThemeStore();
  return { theme, toggleTheme, initTheme, isDark: theme === 'dark' };
};

export default useTheme;
