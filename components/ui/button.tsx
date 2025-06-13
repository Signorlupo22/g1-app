import { StyleSheet, Text, TouchableOpacity, TouchableOpacityProps, useColorScheme } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary';
  isLoading?: boolean;
}

export function Button({ title, variant = 'primary', isLoading, ...props }: ButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const buttonStyle = [
    styles.button,
    variant === 'primary' 
      ? isDark ? styles.primaryDark : styles.primary
      : isDark ? styles.secondaryDark : styles.secondary
  ];

  const textStyle = [
    styles.text,
    variant === 'primary'
      ? isDark ? styles.primaryDarkText : styles.primaryText
      : isDark ? styles.secondaryDarkText : styles.secondaryText
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      disabled={isLoading}
      {...props}
    >
      <Text style={textStyle}>
        {isLoading ? 'Loading...' : title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
  },
  primary: {
    backgroundColor: '#3B82F6', // blue-500
  },
  primaryDark: {
    backgroundColor: '#FFFFFF',
  },
  secondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB', // gray-200
  },
  secondaryDark: {
    backgroundColor: '#1F2937', // gray-800
    borderWidth: 1,
    borderColor: '#374151', // gray-700
  },
  text: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 18,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  primaryDarkText: {
    color: '#000000',
  },
  secondaryText: {
    color: '#111827', // gray-900
  },
  secondaryDarkText: {
    color: '#FFFFFF',
  }
});