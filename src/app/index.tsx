import React from 'react';
import { View } from 'react-native';
import G1GlassesApp from '../components/GlassesDemo2';
import { useTheme } from '../theme/ThemeProvider';

export default function App() {

  const { theme } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <G1GlassesApp />
    </View>
  );
}