import React, { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AudioPacket, BMPImageData, GlassesDeviceInfo, SmartGlassesController, TouchBarEvent } from "../contoller/glasses";

const GlassesDemo: React.FC = () => {
  const [glassesController, setGlassesController] = useState<SmartGlassesController | null>(null);
  const [devices, setDevices] = useState<GlassesDeviceInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    try {
      const controller = new SmartGlassesController();
      setGlassesController(controller);
      addLog('Smart Glasses Controller initialized successfully');
    } catch (error: any) {
      addLog(`Failed to initialize Smart Glasses Controller: ${error.message}`);
      Alert.alert(
        'Initialization Error',
        'Failed to initialize Smart Glasses Controller. Please make sure you have the necessary permissions and are running on an iOS device. ' + error.message
      );
    }
  }, []);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    if (!glassesController) return;

    // Setup event listeners
    glassesController.onTouchBar((event: TouchBarEvent) => {
      addLog(`TouchBar Event: ${event.type} on ${event.side} side`);
    });

    glassesController.onAudioData((data: AudioPacket) => {
      addLog(`Received audio data packet #${data.sequence}`);
    });

    glassesController.onConnectionChange((connected: boolean) => {
      setIsConnected(connected);
      addLog(`Connection status changed: ${connected ? 'Connected' : 'Disconnected'}`);
    });

    return () => {
      glassesController.removeAllListeners();
    };
  }, [glassesController]);

  const handleScan = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    if (isScanning) {
      addLog('Already scanning...');
      return;
    }

    try {
      setIsScanning(true);
      addLog('Scanning for glasses...');
      const foundDevices = await glassesController.scanForGlasses();
      setDevices(foundDevices);
      addLog(`Found ${foundDevices.length} devices`);
      for (const device of foundDevices) {
        addLog(`Device: ${device.name} - ${device.id}`);
      }
    } catch (error: any) {
      if (error.message.includes('Bluetooth is powered off')) {
        Alert.alert(
          'Bluetooth Required',
          'Please turn on Bluetooth to scan for devices.',
          [{ text: 'OK' }]
        );
      } else if (error.message.includes('Bluetooth permission not granted')) {
        Alert.alert(
          'Permission Required',
          'Please grant Bluetooth permissions in your device settings.',
          [{ text: 'OK' }]
        );
      } else {
        addLog(`Error scanning: ${error.message}`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnect = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    if (devices.length < 2) {
      addLog('Need at least 2 devices to connect');
      return;
    }

    try {
      addLog('Connecting to glasses...');
      const leftDevice = devices.find(device => device.name?.includes('_L_'));
      const rightDevice = devices.find(device => device.name?.includes('_R_'));
      
      if (!leftDevice || !rightDevice) {
        addLog('Need both left and right devices to connect');
        return;
      }

      const success = await glassesController.connectToGlasses(leftDevice.id, rightDevice.id);
      if (success) {
        setIsConnected(true);
        addLog('Successfully connected to glasses');
      } else {
        addLog('Failed to connect to glasses');
      }
    } catch (error: any) {
      addLog(`Error connecting: ${error.message}`);
    }
  };

  const handleDisconnect = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    try {
      addLog('Disconnecting...');
      await glassesController.disconnect();
      addLog('Disconnected successfully');
    } catch (error: any) {
      addLog(`Error disconnecting: ${error.message}`);
    }
  };

  const handleStartEvenAI = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    try {
      addLog('Starting Even AI...');
      const success = await glassesController.startEvenAI();
      if (success) {
        addLog('Even AI started successfully');
      } else {
        addLog('Failed to start Even AI');
      }
    } catch (error: any) {
      addLog(`Error starting Even AI: ${error.message}`);
    }
  };

  const handleStopEvenAI = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    try {
      addLog('Stopping Even AI...');
      await glassesController.stopEvenAI();
      addLog('Even AI stopped successfully');
    } catch (error: any) {
      addLog(`Error stopping Even AI: ${error.message}`);
    }
  };

  const handleSendText = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    try {
      const testText = "Hello from the demo app! This is a test message to verify text transmission to the glasses.";
      addLog('Sending text...');
      const success = await glassesController.sendText(testText);
      if (success) {
        addLog('Text sent successfully');
      } else {
        addLog('Failed to send text');
      }
    } catch (error: any) {
      addLog(`Error sending text: ${error.message}`);
    }
  };

  const handleSendImage = async () => {
    if (!glassesController) {
      addLog('Controller not initialized');
      return;
    }

    try {
      // Create a test BMP image data
      const width = 488;  // Match the display width
      const height = 64;  // Example height
      const imageData = new Uint8Array(width * height * 3); // RGB format
      
      // Fill with some test pattern
      for (let i = 0; i < imageData.length; i += 3) {
        imageData[i] = 255;     // R
        imageData[i + 1] = 0;   // G
        imageData[i + 2] = 0;   // B
      }

      const bmpData: BMPImageData = {
        width,
        height,
        data: imageData
      };

      addLog('Sending test image...');
      const success = await glassesController.sendBMPImage(bmpData);
      
      if (success) {
        addLog('Image sent successfully');
      } else {
        addLog('Failed to send image');
      }
    } catch (error: any) {
      addLog(`Error sending image: ${error.message}`);
      console.error('Image send error:', error);
    }
  };

  if (!glassesController) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Smart Glasses Demo</Text>
        <Text style={styles.errorText}>Initializing controller...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Smart Glasses Demo</Text>
      
      <View style={styles.buttonContainer}>
        <Button 
          title={isScanning ? "Scanning..." : "Scan for Devices"} 
          onPress={handleScan}
          disabled={isScanning}
        />
        <Button 
          title={isConnected ? "Disconnect" : "Connect"} 
          onPress={isConnected ? handleDisconnect : handleConnect}
          disabled={devices.length < 2 || isScanning}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button 
          title="Start Even AI" 
          onPress={handleStartEvenAI}
          disabled={!isConnected}
        />
        <Button 
          title="Stop Even AI" 
          onPress={handleStopEvenAI}
          disabled={!isConnected}
        />
      </View>

      <Button 
        title="Send Test Text" 
        onPress={handleSendText}
        disabled={!isConnected}
      />

      <Button 
        title="Send Test Image" 
        onPress={handleSendImage}
        disabled={!isConnected}
      />


      <ScrollView style={styles.logContainer}>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  logContainer: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 5,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default GlassesDemo; 