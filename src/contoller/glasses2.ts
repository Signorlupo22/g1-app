import { BleManager, Characteristic, Device, State } from 'react-native-ble-plx';
import { BMPImageData, SCREEN_STATUS } from './glasses';

// Types
export interface GlassesDeviceInfo {
  id: string;
  name: string;
  rssi?: number;
  isLeft?: boolean;
  isRight?: boolean;
}

export interface BatteryInfo {
  percentage: number;
  isCharging: boolean;
  voltage?: number;
}

export interface NotificationData {
  msg_id: number;
  action: number;
  app_identifier: string;
  title: string;
  subtitle?: string;
  message: string;
  time_s: number;
  date: string;
  display_name: string;
}

export interface WeatherData {
  icon: number; // 0-16, see protocol doc
  temperature: number;
  isCelsius: boolean;
  is24Hour: boolean;
}

// Constants from protocol
const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
const NORDIC_UART_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify

// Command constants
const COMMANDS = {
  SET_BRIGHTNESS: 0x01,
  SET_SILENT_MODE: 0x03,
  SET_NOTIFICATION_APPS: 0x04,
  SET_DASHBOARD: 0x06,
  MICROPHONE_CONTROL: 0x0E,
  SEND_BITMAP: 0x15,
  CLEAR_SCREEN: 0x18,
  SEND_QUICK_NOTE: 0x1E,
  SEND_HARD_RESET: 0x23,
  SEND_HEARTBEAT: 0x25,
  GET_BRIGHTNESS: 0x29,
  GET_BATTERY: 0x2C,
  GET_SERIAL: 0x33,
  SEND_UNPAIR: 0x47,
  SEND_NOTIFICATION: 0x4B,
  CLEAR_NOTIFICATION: 0x4C,
  INIT: 0x4D,
  SEND_TEXT: 0x4E,
  SET_NOTIFICATION_AUTO_DISPLAY: 0x4F,
  SEND_DASHBOARD_LOCK: 0x50,
  GET_AUDIO_RECORDING: 0xF1,
  SET_DEBUG_MODE: 0xF4,
  DEVICE_EVENTS: 0xF5,
  BMP_TRANSMISSION_END: [0x20, 0x0d, 0x0e],
  CRC_CHECK: 0x16,

};

// Response constants
const RESPONSE = {
  SUCCESS: 0xC9,
  FAILURE: 0xCA,
  CONTINUE: 0xCB
};

export class EvenRealitiesG1Manager {
  private bleManager: BleManager;
  private leftDevice: Device | null = null;
  private rightDevice: Device | null = null;
  private leftTxCharacteristic: Characteristic | null = null;
  private rightTxCharacteristic: Characteristic | null = null;
  private isConnected = false;
  private heartbeatInterval: any | null = null;
  private sequenceNumber = 0;
  private heartbeatSequence = 0;
  private batteryInfo: BatteryInfo | null = null;
  private batteryInfoLeft: BatteryInfo | null = null;
  private batteryInfoRight: BatteryInfo | null = null;
  private lastEvent: any | null = null;
  private isInCase: boolean = false;
  private isCaseOpen: boolean = false;
  private isGlassesWorn: boolean = false;
  private isGlassesInBox: boolean = false;
  private isGlassesCharging: boolean = false;
  private isInSilentMode: boolean = false;

  // Event listeners
  private onDeviceEventCallbacks: ((event: any) => void)[] = [];
  private onBatteryUpdateCallbacks: ((battery: BatteryInfo, isLeft: boolean) => void)[] = [];

  constructor() {
    this.bleManager = new BleManager();
  }

  // Initialization
  async initialize(): Promise<void> {
    try {
      const state = await this.getBluetoothState();
      if (state !== State.PoweredOn) {
        throw new Error(`Bluetooth is not powered on. Current state: ${state}`);
      }
      console.log('BLE Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize BLE Manager:', error);
      throw error;
    }
  }

  private async getBluetoothState(): Promise<State> {
    const state = await this.bleManager.state();
    if (state !== State.Unknown) {
      return state;
    }

    return new Promise<State>((resolve) => {
      const subscription = this.bleManager.onStateChange((newState) => {
        subscription.remove();
        resolve(newState);
      });
    });
  }

  // Device Scanning
  async scanForGlasses(timeoutMs: number = 10000): Promise<GlassesDeviceInfo[]> {
    try {
      await this.getBluetoothState();
      const devices: Map<string, GlassesDeviceInfo> = new Map();

      console.log('Starting scan for G1 glasses...');

      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          return;
        }

        if (device && device.name) {
          // Filter for G1 glasses - adjust this pattern based on actual device names
          if (device.name.includes('G1') || device.name.includes('Even') || device.name.includes('Realities')) {
            const deviceInfo: GlassesDeviceInfo = {
              id: device.id,
              name: device.name,
              rssi: device.rssi ?? undefined,
              isLeft: device.name.toLowerCase().includes('l') || device.name.toLowerCase().includes('left'),
              isRight: device.name.toLowerCase().includes('r') || device.name.toLowerCase().includes('right')
            };
            
            devices.set(device.id, deviceInfo);
            console.log('Found G1 ' + (deviceInfo.isLeft ? 'left' : 'right') + ' device: ' + deviceInfo.name);
          }
        }
      });

      // Stop scanning after timeout
      await new Promise(resolve => setTimeout(resolve, timeoutMs));
      this.bleManager.stopDeviceScan();

      const deviceList = Array.from(devices.values());
      console.log(`Scan completed. Found ${deviceList.length} G1 devices`);
      return deviceList;
    } catch (error) {
      console.error('Failed to scan for glasses:', error);
      this.bleManager.stopDeviceScan();
      throw error;
    }
  }

  // Connection Management
  async connectToGlasses(leftDeviceId: string, rightDeviceId: string): Promise<boolean> {
    try {
      console.log('Connecting to glasses...');
      
      // Connect to both devices
      [this.leftDevice, this.rightDevice] = await Promise.all([
        this.connectToDevice(leftDeviceId),
        this.connectToDevice(rightDeviceId)
      ]);

      // Discover services and characteristics
      await this.setupCharacteristics();
      
      // Setup notifications
      await this.setupNotifications();

      // Send initial commands
      await this.sendInitialCommands();

      // Start heartbeat
      this.startHeartbeat();

      this.isConnected = true;
      console.log('Successfully connected to G1 glasses');
      return true;
    } catch (error) {
      console.error('Failed to connect to glasses:', error);
      await this.disconnect();
      return false;
    }
  }

  private async connectToDevice(deviceId: string): Promise<Device> {
    console.log(`Connecting to device: ${deviceId}`);
    const device = await this.bleManager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    return device;
  }

  private async setupCharacteristics(): Promise<void> {
    if (!this.leftDevice || !this.rightDevice) {
      throw new Error('Devices not connected');
    }

    // Get TX characteristics for writing
    const leftServices = await this.leftDevice.services();
    const rightServices = await this.rightDevice.services();

    const leftUartService = leftServices.find(s => s.uuid.toLowerCase() === NORDIC_UART_SERVICE.toLowerCase());
    const rightUartService = rightServices.find(s => s.uuid.toLowerCase() === NORDIC_UART_SERVICE.toLowerCase());

    if (!leftUartService || !rightUartService) {
      throw new Error('UART service not found on devices');
    }

    const leftChars = await leftUartService.characteristics();
    const rightChars = await rightUartService.characteristics();

    this.leftTxCharacteristic = leftChars.find(c => c.uuid.toLowerCase() === NORDIC_UART_TX.toLowerCase()) || null;
    this.rightTxCharacteristic = rightChars.find(c => c.uuid.toLowerCase() === NORDIC_UART_TX.toLowerCase()) || null;

    if (!this.leftTxCharacteristic || !this.rightTxCharacteristic) {
      throw new Error('TX characteristics not found');
    }
  }

  private async setupNotifications(): Promise<void> {
    if (!this.leftDevice || !this.rightDevice) return;

    // Setup notifications for RX characteristics
    await this.leftDevice.monitorCharacteristicForService(
      NORDIC_UART_SERVICE,
      NORDIC_UART_RX,
      (error, characteristic) => {
        if (error) {
          console.error('Left device notification error:', error);
          return;
        }
        if (characteristic?.value) {
          this.handleNotification(characteristic.value, true);
        }
      }
    );

    await this.rightDevice.monitorCharacteristicForService(
      NORDIC_UART_SERVICE,
      NORDIC_UART_RX,
      (error, characteristic) => {
        if (error) {
          console.error('Right device notification error:', error);
          return;
        }
        if (characteristic?.value) {
          this.handleNotification(characteristic.value, false);
        }
      }
    );
  }

  private handleNotification(data: string, isLeft: boolean): void {
    const bytes = this.base64ToUint8Array(data);
    const command = bytes[0];

    //console.log(`Received from ${isLeft ? 'left' : 'right'}:`, Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

    switch (command) {
      case COMMANDS.DEVICE_EVENTS:
        this.handleDeviceEvent(bytes);
        break;
      case COMMANDS.GET_BATTERY:
        this.handleBatteryUpdate(bytes, isLeft);
        break;
      // Add more cases as needed
    }
  }

  private handleDeviceEvent(bytes: Uint8Array): void {
    if (bytes.length < 2) return;
    
    const subCommand = bytes[1];
    const eventData = {
      type: subCommand,
      data: bytes.slice(2)
    };

    console.log('Device event:', this.mapTypeToCommand(eventData.type));
    this.onDeviceEventCallbacks.forEach(callback => callback(eventData));
  }

  private handleBatteryUpdate(bytes: Uint8Array, isLeft: boolean): void {
    if (bytes.length < 4) return;

    const batteryInfo: BatteryInfo = {
      percentage: bytes[3],
      isCharging: (bytes[2] & 0x01) !== 0,
      voltage: bytes.length > 4 ? (bytes[4] << 8 | bytes[5]) : undefined
    };

    console.log(`Battery update (${isLeft ? 'left' : 'right'}):`, batteryInfo);
    this.onBatteryUpdateCallbacks.forEach(callback => callback(batteryInfo, isLeft));
  }

  // Command sending
  private async sendCommand(data: Uint8Array, toLeft: boolean = true, toRight: boolean = true): Promise<void> {
    const promises: Promise<void>[] = [];

    if (toLeft && this.leftTxCharacteristic) {
      promises.push(this.writeToCharacteristic(this.leftTxCharacteristic, data));
    }
    
    if (toRight && this.rightTxCharacteristic) {
      promises.push(this.writeToCharacteristic(this.rightTxCharacteristic, data));
    }

    await Promise.all(promises);
  }

  private async writeToCharacteristic(characteristic: Characteristic, data: Uint8Array): Promise<void> {
    const base64Data = this.uint8ArrayToBase64(data);
    await characteristic.writeWithResponse(base64Data);
  }

  // Public API Methods
  async sendNotification(notification: NotificationData): Promise<void> {
    const notificationObj = {
      ncs_notification: notification
    };
    
    const jsonString = JSON.stringify(notificationObj);
    const jsonBytes = new TextEncoder().encode(jsonString);
    
    if (jsonBytes.length > 180) {
      throw new Error('Notification payload too large');
    }

    const command = new Uint8Array(4 + jsonBytes.length);
    command[0] = COMMANDS.SEND_NOTIFICATION;
    command[1] = 0x00; // Pad
    command[2] = 0x01; // Chunk count
    command[3] = 0x00; // Chunk index
    command.set(jsonBytes, 4);

    await this.sendCommand(command, true, false); // Send to left arm only
  }

  async clearNotification(msgId: number): Promise<void> {
    const command = new Uint8Array(5);
    command[0] = COMMANDS.CLEAR_NOTIFICATION;
    command[1] = (msgId >> 24) & 0xFF;
    command[2] = (msgId >> 16) & 0xFF;
    command[3] = (msgId >> 8) & 0xFF;
    command[4] = msgId & 0xFF;

    await this.sendCommand(command, true, false); // Send to left arm only
  }
  

  private splitTextIntoLines(text: string): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      // Rough character width calculation based on display width and font size
      if (testLine.length * (21 * 0.6) <= 488) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word);
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
  private splitIntoScreens(lines: string[]): string[][] {
    const screens: string[][] = [];

    for (let i = 0; i < lines.length; i += 5) {
      screens.push(lines.slice(i, i + 5));
    }

    return screens;
  }

  private createTextPackets(lines: string[]): Uint8Array[] {
    const packets: Uint8Array[] = [];
    const text = lines.join('\n');
    const textBytes = new TextEncoder().encode(text);

    for (let i = 0; i < textBytes.length; i += 194 - 10) { // Reserve space for headers
      const chunk = textBytes.slice(i, i + 194 - 10);
      packets.push(chunk);
    }

    return packets;
  }

  private createTextPacket(
    data: Uint8Array,
    currentPacket: number,
    totalPackets: number,
    currentPage: number,
    maxPages: number
  ): Uint8Array {
    const sequence = this.sequenceNumber++;
    const newScreen = SCREEN_STATUS.NEW_CONTENT | SCREEN_STATUS.TEXT_SHOW;

    const header = new Uint8Array([
      COMMANDS.SEND_TEXT,
      sequence,
      totalPackets,
      currentPacket,
      newScreen,
      0, // new_char_pos0
      0, // new_char_pos1
      currentPage,
      maxPages
    ]);

    const result = new Uint8Array(header.length + data.length);
    result.set(header);
    result.set(data, header.length);
    return result;
  }

  async sendText(text: string, x: number = 0, y: number = 0, replace: boolean): Promise<boolean> {
    if (!this.isConnected) return false;
    console.log('Sending text:', text);
    const lines = this.splitTextIntoLines(text);
    console.log('Lines:', lines);
    const screens = this.splitIntoScreens(lines);
    console.log('Screens:', screens);

    // Calculate display parameters
    const DISPLAY_WIDTH = 488;
    const FONT_SIZE = 21;
    const LINES_PER_SCREEN = 5;
    const LINE_HEIGHT = FONT_SIZE * 1.2; // Add some spacing between lines

    for (let screenIndex = 0; screenIndex < screens.length; screenIndex++) {
      const packets = this.createTextPackets(screens[screenIndex]);

      for (let packetIndex = 0; packetIndex < packets.length; packetIndex++) {
        const screenStatus = replace ? 
          SCREEN_STATUS.TEXT_SHOW : // Just show text without clearing
          SCREEN_STATUS.NEW_CONTENT | SCREEN_STATUS.TEXT_SHOW; // Clear and show new text

        const packet = this.createTextPacket(
          packets[packetIndex],
          packetIndex,
          packets.length,
          screenIndex,
          screens.length
        );

        // Override the screen status in the packet
        packet[4] = screenStatus;

        // Calculate position based on screen index and line number
        const screenY = y + (screenIndex * LINES_PER_SCREEN * LINE_HEIGHT);
        
        // Ensure x position is within display width
        const adjustedX = Math.min(x, DISPLAY_WIDTH - (FONT_SIZE * 0.6)); // 0.6 is approximate character width ratio
        
        // Set position in packet
        packet[5] = adjustedX & 0xFF; // x position LSB
        packet[6] = (adjustedX >> 8) & 0xFF; // x position MSB
        packet[7] = screenY & 0xFF; // y position LSB
        packet[8] = (screenY >> 8) & 0xFF; // y position MSB

        await this.sendCommand(packet);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    return true;
  }

  async sendLoadingAnimation(iterations: number = 5): Promise<void> {
    if (!this.isConnected) return;

    const frames = [
      '/', '-', '\\', '|', 
    ];

    for (let i = 0; i < iterations; i++) {
      for (const frame of frames) {
        const packet = this.createTextPacket(
          new TextEncoder().encode(frame),
          0, // Single packet
          1, // Total packets
          0, // Single screen
          1  // Total screens
        );

        // Set screen status to just show text without clearing
        packet[4] = SCREEN_STATUS.TEXT_SHOW;

        // Set x,y position to 100,100
        packet[5] = 100 & 0xFF; // x LSB
        packet[6] = (100 >> 8) & 0xFF; // x MSB  
        packet[7] = 100 & 0xFF; // y LSB
        packet[8] = (100 >> 8) & 0xFF; // y MSB

        await this.sendCommand(packet);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }
    
  async setBrightness(brightness: number, autoMode: boolean = false): Promise<void> {
    const command = new Uint8Array(3);
    command[0] = COMMANDS.SET_BRIGHTNESS;
    command[1] = Math.max(0, Math.min(42, brightness)); // 0x00-0x2A
    command[2] = autoMode ? 0x01 : 0x00;

    await this.sendCommand(command, false, true); // Send to right arm only
  }

  async setSilentMode(enabled: boolean): Promise<void> {
    const command = new Uint8Array(2);
    command[0] = COMMANDS.SET_SILENT_MODE;
    command[1] = enabled ? 0x0C : 0x0A;

    await this.sendCommand(command); // Send to both arms
  }

  async enableMicrophone(enabled: boolean): Promise<void> {
    const command = new Uint8Array(2);
    command[0] = COMMANDS.MICROPHONE_CONTROL;
    command[1] = enabled ? 0x01 : 0x00;

    await this.sendCommand(command);
  }

  async clearScreen(): Promise<void> {
    const command = new Uint8Array(1);
    command[0] = COMMANDS.CLEAR_SCREEN;

    await this.sendCommand(command);
  }

  async getBatteryStatus(): Promise<void> {
    const command = new Uint8Array(2);
    command[0] = COMMANDS.GET_BATTERY;
    command[1] = 0x01;

    await this.sendCommand(command);
  }

  async setDashboardTimeAndWeather(weather: WeatherData): Promise<void> {
    const now = new Date();
    const unixTimestamp = Math.floor(now.getTime() / 1000);
    const unixTimestampMs = now.getTime();

    const command = new Uint8Array(18);
    command[0] = COMMANDS.SET_DASHBOARD;
    command[1] = 0x12; // Length
    command[2] = 0x00; // Pad
    command[3] = this.sequenceNumber++ & 0xFF;
    command[4] = 0x01; // Subcommand: Set Time and Weather
    
    // Unix timestamp (32-bit seconds)
    command[5] = (unixTimestamp >> 24) & 0xFF;
    command[6] = (unixTimestamp >> 16) & 0xFF;
    command[7] = (unixTimestamp >> 8) & 0xFF;
    command[8] = unixTimestamp & 0xFF;
    
    // Unix timestamp (64-bit milliseconds)
    const msBytes = new ArrayBuffer(8);
    const msView = new DataView(msBytes);
    msView.setBigUint64(0, BigInt(unixTimestampMs), false);
    const msArray = new Uint8Array(msBytes);
    command.set(msArray, 9);
    
    command[17] = weather.icon;
    command[18] = weather.temperature;
    command[19] = weather.isCelsius ? 0x00 : 0x01;
    command[20] = weather.is24Hour ? 0x01 : 0x00;

    await this.sendCommand(command);
  }

  // Event listeners
  onDeviceEvent(callback: (event: any) => void): void {
    this.onDeviceEventCallbacks.push(callback);
  }

  onBatteryUpdate(callback: (battery: BatteryInfo, isLeft: boolean) => void): void {
    this.onBatteryUpdateCallbacks.push(callback);
  }

  // Private methods
  private async sendInitialCommands(): Promise<void> {
    // Send Init command
    const initCommand = new Uint8Array(2);
    initCommand[0] = COMMANDS.INIT;
    initCommand[1] = 0xFB;
    await this.sendCommand(initCommand, true, false); // Send to left arm only

    // Small delay between commands
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const command = new Uint8Array(2);
        command[0] = COMMANDS.SEND_HEARTBEAT;
        command[1] = this.heartbeatSequence++ & 0xFF;
        await this.sendCommand(command);
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, 28000); // Send every 28 seconds (protocol specifies < 32 seconds)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }


  private calculateCRC32(data: Uint8Array): number {
    // CRC32-XZ implementation for BMP data
    const polynomial = 0x04C11DB7;
    let crc = 0xFFFFFFFF;

    // Storage address for BMP data is 0x001C0000
    const storageAddress = new Uint8Array([0x00, 0x1C, 0x00, 0x00]);

    // First calculate CRC for storage address
    for (let i = 0; i < storageAddress.length; i++) {
      crc ^= storageAddress[i] << 24;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x80000000) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc <<= 1;
        }
      }
    }

    // Then calculate CRC for the actual BMP data
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 24;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x80000000) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc <<= 1;
        }
      }
    }

    // Convert to big endian unsigned 32-bit
    const result = (~crc) >>> 0;
    return (result << 24) | ((result & 0xFF00) << 8) | ((result & 0xFF0000) >> 8) | (result >>> 24);
  }

private createBMPPackets(imageData: Uint8Array): Uint8Array[] {
    const packets: Uint8Array[] = [];
    const chunkSize = 194 - 2; // 194 bytes total, minus 2 for command and index

    for (let i = 0; i < imageData.length; i += chunkSize) {
      const chunk = imageData.slice(i, i + chunkSize);
      const packet = new Uint8Array(chunk.length + (i === 0 ? 6 : 2));
      
      packet[0] = COMMANDS.SEND_BITMAP;
      packet[1] = Math.floor(i / chunkSize) & 0xFF;

      if (i === 0) {
        // First packet includes storage address
        packet[2] = 0x00;
        packet[3] = 0x1c;
        packet[4] = 0x00;
        packet[5] = 0x00;
        packet.set(chunk, 6);
      } else {
        packet.set(chunk, 2);
      }

      packets.push(packet);
    }

    return packets;
  }

  private convertTo1BitBMP(data: Uint8Array): Uint8Array {
    // Skip BMP header (54 bytes) and get to the actual image data
    const imageData = data.slice(54);
    
    // For 1-bit BMP, each byte represents 8 pixels
    // The data is stored in rows, with each row padded to 4-byte boundary
    const width = 576;
    const height = 136;
    const bytesPerRow = Math.ceil(width / 8);
    const paddedBytesPerRow = Math.ceil(bytesPerRow / 4) * 4;
    
    const bmpData = new Uint8Array(bytesPerRow * height);
    
    // Process each row
    for (let y = 0; y < height; y++) {
      const sourceRow = imageData.slice(y * paddedBytesPerRow, (y + 1) * paddedBytesPerRow);
      const targetRow = bmpData.slice(y * bytesPerRow, (y + 1) * bytesPerRow);
      
      // Copy row data, skipping padding
      for (let x = 0; x < bytesPerRow; x++) {
        targetRow[x] = sourceRow[x];
      }
    }
    
    return bmpData;
  }

  async sendBMPImage(imageData: BMPImageData): Promise<boolean> {
    if (!this.isConnected) return false;

    // Validate image dimensions
    if (imageData.width !== 576 || imageData.height !== 136) {
      console.error('Image must be 576x136 pixels');
      return false;
    }

    try {
      console.log('Starting BMP transmission...');
      const bmpData = this.convertTo1BitBMP(imageData.data);
      console.log('Converted to 1-bit BMP, data length:', bmpData.length);
      
      const packets = this.createBMPPackets(imageData.data);
      console.log('Created', packets.length, 'packets');

      // Send packets sequentially - left side first, then right
      for (let i = 0; i < packets.length; i++) {
        console.log(`Sending packet ${i + 1}/${packets.length}`);
        await this.sendCommand(packets[i], true, false);
        await this.sendCommand(packets[i], false, true);
        await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay
      }

      console.log('Sending end command...');
      // Send transmission end command
      const endCommand = new Uint8Array([0x20, 0x0d, 0x0e]);
      await this.sendCommand(endCommand, true, false);
      await this.sendCommand(endCommand, false, true);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for response

      console.log('Sending CRC check...');
      // Calculate CRC including storage address
      const crcData = new Uint8Array([0x00, 0x1c, 0x00, 0x00, ...bmpData]);
      const crc = this.calculateCRC32(crcData);
      const crcCommand = new Uint8Array([COMMANDS.CRC_CHECK, ...this.uint32ToBytes(crc)]);
      await this.sendCommand(crcCommand, true, false);
      await this.sendCommand(crcCommand, false, true);

      console.log('BMP transmission complete');
      return true;
    } catch (error) {
      console.error('Failed to send BMP:', error);
      return false;
    }
  }


  async showImage(imageData: BMPImageData): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      // Send command to display the buffered image
      const displayCommand = new Uint8Array([COMMANDS.SEND_BITMAP, 0x00, 0x00, 0x1c, 0x00, 0x00]);
      await this.sendCommand(displayCommand, true, false);
      await this.sendCommand(displayCommand, false, true);

      console.log('Sending CRC check...');
      // Calculate CRC including storage address
      const bmpData = this.convertTo1BitBMP(imageData.data);
      const crcData = new Uint8Array([0x00, 0x1c, 0x00, 0x00, ...bmpData]);
      const crc = this.calculateCRC32(crcData);
      const crcCommand = new Uint8Array([COMMANDS.CRC_CHECK, ...this.uint32ToBytes(crc)]);
      await this.sendCommand(crcCommand, true, false);
      await this.sendCommand(crcCommand, false, true);

      console.log('Image display complete');
      return true;
    } catch (error) {
      console.error('Failed to show image:', error);
      return false;
    }
  }

  private uint32ToBytes(value: number): number[] {
    return [
      (value >>> 24) & 0xFF,
      (value >>> 16) & 0xFF,
      (value >>> 8) & 0xFF,
      value & 0xFF
    ];
  }

  // Utility methods
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
  }

  async getAudioRecording(sequence: number = 0): Promise<void> {
    // Validate sequence number is in valid range
    sequence = Math.max(0, Math.min(255, sequence));

    const command = new Uint8Array(2);
    command[0] = COMMANDS.GET_AUDIO_RECORDING; // 0xF1
    command[1] = sequence; // Sequence number 0-255

    // Send command to get audio data chunk for this sequence
    await this.sendCommand(command);

    // Note: Audio data will be received via notification callback
    // The glasses will send back the audio data chunk corresponding 
    // to this sequence number

    // Create a promise that will resolve when we receive the audio data
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for audio data'));
      }, 5000); // 5 second timeout

      // Add one-time listener for audio data
      const audioHandler = (data: any) => {
        if (data.type === 'audio' && data.sequence === sequence) {
          clearTimeout(timeout);
          
          // Convert audio data to base64
          const audioBase64 = this.uint8ArrayToBase64(data.audioData);

          // Save audio data
          try {
            // Save base64 audio data
            localStorage.setItem(`audio_${sequence}`, audioBase64);
            resolve();
          } catch (error) {
            reject(error); 
          }

          // Remove this one-time handler
          this.onDeviceEventCallbacks = this.onDeviceEventCallbacks.filter(cb => cb !== audioHandler);
        }
      };

      this.onDeviceEventCallbacks.push(audioHandler);
    });
  }

  // Cleanup
  async disconnect(): Promise<void> {
    try {
      this.stopHeartbeat();
      this.isConnected = false;

      if (this.leftDevice) {
        await this.leftDevice.cancelConnection();
        this.leftDevice = null;
      }
      
      if (this.rightDevice) {
        await this.rightDevice.cancelConnection();
        this.rightDevice = null;
      }

      this.leftTxCharacteristic = null;
      this.rightTxCharacteristic = null;
      
      console.log('Disconnected from G1 glasses');
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }

  private mapTypeToCommand(type: number): string {
    switch (type) {
      case 0x00:
        return "TouchPad Double Tap";
      case 0x01:
        return "TouchPad Single Tap";
      case 0x02:
        return "Head Up";
      case 0x03:
        return "Head Down";
      case 0x04:
        this.isGlassesWorn = true;
        this.isInSilentMode = true;
        return "TouchPad Triple Tap";
      case 0x05:
        this.isGlassesWorn = true;
        this.isInSilentMode = false;
        return "TouchPad Triple Tap";
      case 0x06:
        this.isGlassesWorn = true;
        return "Glasses are worn";
      case 0x07:
        this.isGlassesWorn = false;
        return "Glasses taken off, not in box";
      case 0x08:
        this.isInCase = true;
        this.isCaseOpen = true;
        return "Put in case, lid open";
      case 0x09:
        this.isGlassesCharging = true;
        return "Charging Status Change";
      case 0x0B:
        this.isInCase = true;
        this.isCaseOpen = false;
        return "Put in case, lid closed";
      case 0x0E:
        this.isGlassesCharging = false;
        return "Case Charging Status Change";
      case 0x0F:
        this.isGlassesCharging = false;
        return "Case Battery Percent";
      case 0x11:
        this.isGlassesWorn = true;
        return "BLE Paired Success";
      case 0x12:
        this.isGlassesWorn = true;
        return "Right TouchPad pressed, held and released";
      case 0x17:
        this.isGlassesWorn = true;
        this.clearScreen();
        return "Left TouchPad pressed and held";
      case 0x18:
        this.isGlassesWorn = true;
        this.clearScreen();
        return "Left TouchPad pressed Released";
      case 0x1E:
        this.isGlassesWorn = true;
        return "Open Dashboard (double tap)";
      case 0x1F:
        return "Close Dashboard (double tap)";
      case 0x20:
        return "Double tap (translate/transcribe mode)";
      default:
        return 'Unknown event';
    }
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }
  

  get devices(): { left: Device | null; right: Device | null; isInSilentMode: boolean; isInCase: boolean; isCaseOpen: boolean; isGlassesWorn: boolean; isGlassesInBox: boolean; isGlassesCharging: boolean } {
    return {
      left: this.leftDevice,
      right: this.rightDevice,
      isInSilentMode: this.isInSilentMode,
      isInCase: this.isInCase,
      isCaseOpen: this.isCaseOpen,
      isGlassesWorn: this.isGlassesWorn,
      isGlassesInBox: this.isGlassesInBox,
      isGlassesCharging: this.isGlassesCharging
    };
  }
}