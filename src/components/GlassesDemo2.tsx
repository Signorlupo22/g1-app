import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/ui/button';
import { Buffer } from 'buffer';

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Image,
    PermissionsAndroid, Platform,
    SafeAreaView,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { BatteryInfo, EvenRealitiesG1Manager, GlassesDeviceInfo, NotificationData } from '../contoller/glasses2';
//'┐ └ ┴ ┬ ├ ─ ┼ ┘ ┌'
const G1GlassesApp: React.FC = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [devices, setDevices] = useState<GlassesDeviceInfo[]>([]);
    const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
    const [selectedRight, setSelectedRight] = useState<string | null>(null);
    const [batteryLeft, setBatteryLeft] = useState<BatteryInfo | null>(null);
    const [batteryRight, setBatteryRight] = useState<BatteryInfo | null>(null);
    const [textToSend, setTextToSend] = useState(
        '┌────────────────────┬────────────────────┐\n' +
        '│ hey this test│asdasdasd│\n' +
        '├────────────────────┼────────────────────┤\n' +
        '│ asdasdasd│ asdasdasdasd│'
    );
    const [brightness, setBrightness] = useState(20);
    const [events, setEvents] = useState<string[]>([]);
    const [x, setX] = useState(100);
    const [y, setY] = useState(100);

    const [isGlassesWorn, setIsGlassesWorn] = useState(false);
    const [isGlassesInBox, setIsGlassesInBox] = useState(false);
    const [isGlassesCharging, setIsGlassesCharging] = useState(false);
    const [isInCase, setIsInCase] = useState(false);
    const [isInSilentMode, setIsInSilentMode] = useState(false);
    const [isCaseOpen, setIsCaseOpen] = useState(false);

    const g1Manager = useRef<EvenRealitiesG1Manager | null>(null);

    useEffect(() => {
        initializeManager();
        return () => {
            cleanup();
        };
    }, []);

    useEffect(() => {
        if (g1Manager.current) {
            setIsGlassesWorn(g1Manager.current.devices.isGlassesWorn);
            setIsGlassesInBox(g1Manager.current.devices.isGlassesInBox);
            setIsGlassesCharging(g1Manager.current.devices.isGlassesCharging);
        }
    }, [g1Manager.current]);

    const initializeManager = async () => {
        try {
            // Request permissions on Android
            if (Platform.OS === 'android') {
                await requestBluetoothPermissions();
            }

            g1Manager.current = new EvenRealitiesG1Manager();
            await g1Manager.current.initialize();
            console.log('Scanning for devices');
            await scanForDevices();
            console.log('Connecting to glasses');
            await connectToGlasses();

            // Setup event listeners
            g1Manager.current.onDeviceEvent((event) => {
                const eventStr = `Device Event: Type ${event.type} at ${new Date().toLocaleTimeString()}`;
                setEvents(prev => [eventStr, ...prev.slice(0, 9)]); // Keep last 10 events
            });

            g1Manager.current.onBatteryUpdate((battery, isLeft) => {
                if (isLeft) {
                    setBatteryLeft(battery);
                } else {
                    setBatteryRight(battery);
                }
            });

            console.log('G1 Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize G1 Manager:', error);
            Alert.alert('Error', 'Failed to initialize Bluetooth manager');
        }
    };

    const requestBluetoothPermissions = async () => {
        try {
            const granted = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);

            const allGranted = Object.values(granted).every(
                permission => permission === PermissionsAndroid.RESULTS.GRANTED
            );

            if (!allGranted) {
                throw new Error('Bluetooth permissions not granted');
            }
        } catch (error) {
            console.error('Permission request failed:', error);
            throw error;
        }
    };

    const scanForDevices = async () => {
        if (!g1Manager.current) return;

        setIsScanning(true);
        setDevices([]);

        try {
            const foundDevices = await g1Manager.current.scanForGlasses(10000);
            setDevices(foundDevices);

            // Auto-select left and right devices if found
            const leftDevice = foundDevices.find(d => d.isLeft);
            const rightDevice = foundDevices.find(d => d.isRight);

            if (leftDevice) setSelectedLeft(leftDevice.id);
            if (rightDevice) setSelectedRight(rightDevice.id);

        } catch (error) {
            console.error('Scan failed:', error);
            Alert.alert('Scan Failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsScanning(false);
        }
    };

    const connectToGlasses = async () => {
        if (!g1Manager.current || !selectedLeft || !selectedRight) {
            Alert.alert('Error', 'Please select both left and right devices');
            return;
        }

        try {
            const success = await g1Manager.current.connectToGlasses(selectedLeft, selectedRight);
            if (success) {
                setIsConnected(true);

                // Request initial battery status
                setTimeout(() => {
                    g1Manager.current?.getBatteryStatus();
                }, 2000);
            } else {
                Alert.alert('Connection Failed', 'Could not connect to glasses');
            }
        } catch (error) {
            console.error('Connection failed:', error);
            Alert.alert('Connection Failed', error instanceof Error ? error.message : 'Unknown error');
        }
    };

    const disconnectFromGlasses = async () => {
        if (!g1Manager.current) return;

        try {
            await g1Manager.current.disconnect();
            setIsConnected(false);
            setBatteryLeft(null);
            setBatteryRight(null);
            Alert.alert('Disconnected', 'Disconnected from G1 glasses');
        } catch (error) {
            console.error('Disconnect failed:', error);
        }
    };

    const sendText = async (x: number, y: number) => {
        if (!g1Manager.current || !isConnected) return;

        try {
            await g1Manager.current.sendText(textToSend, x, y, false);
        } catch (error) {
            console.error('Send text failed:', error);
            Alert.alert('Error', 'Failed to send text');
        }
    };

    const sendNotification = async () => {
        if (!g1Manager.current || !isConnected) return;

        const notification: NotificationData = {
            msg_id: Date.now(),
            action: 0,
            app_identifier: 'com.example.reactnative',
            title: 'React Native App',
            subtitle: 'Test Notification',
            message: 'This is a test notification from React Native!',
            time_s: Math.floor(Date.now() / 1000),
            date: new Date().toISOString(),
            display_name: 'RN App'
        };

        try {
            await g1Manager.current.sendNotification(notification);
            Alert.alert('Success', 'Notification sent to glasses');
        } catch (error) {
            console.error('Send notification failed:', error);
            Alert.alert('Error', 'Failed to send notification');
        }
    };

    const adjustBrightness = async () => {
        if (!g1Manager.current || !isConnected) return;

        try {
            await g1Manager.current.setBrightness(brightness);
            Alert.alert('Success', `Brightness set to ${brightness}`);
        } catch (error) {
            console.error('Set brightness failed:', error);
            Alert.alert('Error', 'Failed to set brightness');
        }
    };

    const clearScreen = async () => {
        if (!g1Manager.current || !isConnected) return;

        try {
            await g1Manager.current.clearScreen();
            Alert.alert('Success', 'Screen cleared');
        } catch (error) {
            console.error('Clear screen failed:', error);
            Alert.alert('Error', 'Failed to clear screen');
        }
    };

    const cleanup = async () => {
        if (g1Manager.current) {
            await g1Manager.current.disconnect();
        }
    };

    const silentMode = async () => {
        if (!g1Manager.current || !isConnected) return;
        await g1Manager.current.setSilentMode(true);
    };

    const renderDevice = (device: GlassesDeviceInfo) => (
        <View key={device.id}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: 'blue' }}>{device.name}</Text>
            <Text style={{ fontSize: 16, color: 'gray' }}>{device.isLeft ? 'Left' : 'Right'}</Text>
            <Text>
                ID: {device.id.substring(0, 8)}... | RSSI: {device.rssi}dBm
            </Text>
            <View>
                <TouchableOpacity
                    onPress={() => setSelectedLeft(device.id)}
                >
                    <Text>Left</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setSelectedRight(device.id)}
                >
                    <Text>Right</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const loadBMPImageAsBase64 = async (uri: string) => {
        try {
          // Carica asset (anche da `require`)
          const asset = Asset.fromModule(require('../../assets/images/test.bmp'));
      
          // Scarica l'asset in locale
          await asset.downloadAsync();
      
          // asset.localUri sarà il file path leggibile da FileSystem
          const localUri = asset.localUri;
          if (!localUri) {
            console.error('localUri non disponibile');
            return;
          }
      
          // Leggi come base64
          const base64Data = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
      
          console.log('✅ base64Data:', base64Data.slice(0, 50), '...');
      
          return base64Data;
        } catch (err) {
          console.error('❌ Errore caricamento BMP:', err);
          return null;
        }
      };
      

    const sendBMP = async () => {
        if (!g1Manager.current || !isConnected) return;
        const width = 576;
        const height = 136;

        //const imageDataBase64 = await loadBMPImageAsBase64('../../assets/images/test.bmp');

        const imageDataBase641 = await loadBMPImageAsBase64('../../assets/images/test2.bmp');
        const imageDataBase642 = await loadBMPImageAsBase64('../../assets/images/test2.bmp');

        try {
            const buffer1 = new Uint8Array(Buffer.from(imageDataBase641 || '', 'base64'));

            await g1Manager.current.sendBMPImage({
                width,
                height,
                data: buffer1
            });


        } catch (err) {
            console.error('Errore lettura BMP:', err.message);
        }
    };


    const showImage = async () => {
        if (!g1Manager.current || !isConnected) return;
        const width = 576;
        const height = 136;

        const imageDataBase641 = await loadBMPImageAsBase64('../../assets/images/test2.bmp');

        try {
            const buffer1 = new Uint8Array(Buffer.from(imageDataBase641 || '', 'base64'));

            await g1Manager.current.showImage({
                width,
                height,
                data: buffer1
            },);


        } catch (err) {
            console.error('Errore lettura BMP:', err.message);
        }
    };

    const printEvents = () => {
        if (!g1Manager.current || !isConnected) return;

        g1Manager.current.onDeviceEvent((event) => {
            console.log('Device Event:', event);
            // Add event to state
            setEvents(prev => [`${new Date().toLocaleTimeString()}: ${event.type}`, ...prev]);
        });

        g1Manager.current.onBatteryUpdate((battery, isLeft) => {
            console.log('Battery Update:', battery, isLeft ? 'Left' : 'Right');
            if (isLeft) {
                setBatteryLeft(battery);
            } else {
                setBatteryRight(battery);
            }
        });
    };

    return (
        <SafeAreaView>
            <ScrollView>
                {/* Connection Status */}
                <View>

                    <Image source={require('../../assets/images/test.bmp')} style={{ width: "100%", height: 80 }} />
                    {isConnected ?
                        <View style={{ flexDirection: 'column', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
                            <Image source={require('../../assets/images/glasses.png')} style={{ width: "100%", height: 200 }} />
                            <Text style={{ color: 'green', fontSize: 40, }}>Connected</Text>
                        </View>



                        : <View style={{ flexDirection: 'column', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
                            <Image source={require('../../assets/images/glasses.png')} style={{ width: "100%", height: 200 }} />
                            <ThemedText style={{ color: 'red' }}>Disconnected</ThemedText>

                            <Button onPress={() => {
                                scanForDevices();
                            }}
                                title="Scan for devices"
                            />

                            <Button onPress={() => {
                                connectToGlasses();
                            }}
                                title="Connect to glasses"
                            />

                        </View>}

                    {/*<ThemedText>Is Glasses Worn: {isGlassesWorn ? 'Worn' : 'Not Worn'}</ThemedText>
                    <ThemedText>Is Glasses in Box: {isGlassesInBox ? 'In Box' : 'Not in Box'}</ThemedText>
                    <ThemedText>Is Glasses Charging: {isGlassesCharging ? 'Charging' : 'Not Charging'}</ThemedText>
                    <ThemedText>Is Glasses in Case: {isInCase ? 'In Case' : 'Not in Case'}</ThemedText>
                    <ThemedText>Is Glasses in Silent Mode: {isInSilentMode ? 'Silent Mode' : 'Not Silent Mode'}</ThemedText>
                    <ThemedText>Is Case Open: {isCaseOpen ? 'Open' : 'Closed'}</ThemedText> */}
                </View>
                <View>
                    <TextInput
                        placeholder="Enter text"
                        value={textToSend}
                        style={{ width: 100, height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 10, color: "white" }}
                        onChangeText={setTextToSend}
                    />
                    <TextInput
                        placeholder="Enter x"
                        style={{ width: 100, height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 10, color: "white" }}
                        value={x.toString()}
                        onChangeText={(text) => setX(parseInt(text) || 0)}
                    />
                    <TextInput
                        placeholder="Enter y"
                        value={y.toString()}
                        style={{ width: 100, height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 10, color: "white" }}
                        onChangeText={(text) => setY(parseInt(text) || 0)}
                    />
                </View>
                <Button onPress={() => {
                    sendText(x, y);
                }}
                    title="Send text"
                />

                <Button onPress={() => {
                    sendNotification();
                }}
                    title="Send notification"
                />

                <Button onPress={() => {
                    adjustBrightness();
                }}
                    title="Adjust brightness"
                />

                <Button onPress={() => {
                    clearScreen();
                }}
                    title="Clear screen"
                />

                <Button onPress={() => {
                    g1Manager.current?.sendLoadingAnimation(50);
                }}
                    title="Send loading animation"
                />


                <Button onPress={() => {
                    g1Manager.current?.getAudioRecording();
                }}
                    title="Get audio recording"
                />

                <Button onPress={() => {
                    sendBMP();
                }}
                    title="Send BMP"
                />

                <Button onPress={() => {
                    showImage();
                }}
                    title="Show image"
                />


                <Button onPress={() => {
                    disconnectFromGlasses();
                }}
                    title="Disconnect from glasses"
                />

                {/* Device List */}
                <View>
                    <Text>Available Devices</Text>
                    {devices.length > 0 ? (
                        devices.map(renderDevice)
                    ) : (
                        <Text>No devices found</Text>
                    )}
                </View>

                {/* Device Selection */}
                <View>
                    <TouchableOpacity>
                        <Text>Left</Text>
                    </TouchableOpacity>
                    <TouchableOpacity>
                        <Text>Right</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default G1GlassesApp;