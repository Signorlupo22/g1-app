import { useTheme } from './ThemeProvider';

export function useThemeColors() {
  const { theme } = useTheme();
  
  const getColor = (colorName: string) => {
    return theme === 'dark' ? `${colorName}-dark` : colorName;
  };

  return {
    background: getColor('background'),
    foreground: getColor('foreground'),
    card: getColor('card'),
    cardForeground: getColor('card-foreground'),
    primary: getColor('primary'),
    primaryForeground: getColor('primary-foreground'),
    secondary: getColor('secondary'),
    secondaryForeground: getColor('secondary-foreground'),
    muted: getColor('muted'),
    mutedForeground: getColor('muted-foreground'),
    accent: getColor('accent'),
    accentForeground: getColor('accent-foreground'),
    destructive: getColor('destructive'),
    border: getColor('border'),
    input: getColor('input'),
    ring: getColor('ring'),
  };
} 