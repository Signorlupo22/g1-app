import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import GlassesDemo from './components/GlassesDemo';

const App = () => {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <GlassesDemo />
    </SafeAreaView>
  );
};

export default App; 