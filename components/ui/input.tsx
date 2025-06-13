import { StyleSheet, Text, TextInput, TextInputProps, useColorScheme, View } from 'react-native';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, ...props }: InputProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, isDark ? styles.labelDark : styles.labelLight]}>
        {label}
      </Text>
      <TextInput
        style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  label: {
    fontSize: 18
  },
  labelLight: {
    color: '#374151' // gray-700
  },
  labelDark: {
    color: '#D1D5DB' // gray-300
  },
  input: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 18
  },
  inputLight: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderColor: '#E5E7EB', // gray-200
    color: '#111827' // gray-900
  },
  inputDark: {
    backgroundColor: 'rgba(31,41,55,0.8)', // gray-800 with opacity
    borderColor: '#374151', // gray-700
    color: '#FFFFFF'
  },
  error: {
    color: '#EF4444', // red-500
    fontSize: 14,
    marginTop: 4
  }
});