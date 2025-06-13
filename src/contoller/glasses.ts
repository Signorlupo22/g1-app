import { Buffer } from 'buffer';
import { NativeEventEmitter, Platform } from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';

// Types and Interfaces
export interface GlassesDeviceInfo {
  id: string;
  name: string;
  rssi?: number;
}

export interface TouchBarEvent {
  type: 'single' | 'double' | 'triple';
  side: 'left' | 'right';
}

export interface AudioPacket {
  sequence: number;
  data: Uint8Array;
}

export interface AIResponse {
  text: string;
  totalPages: number;
}

export interface BMPImageData {
  width: number;
  height: number;
  data: Uint8Array;
}

// Protocol Commands
export const COMMANDS = {
  TOUCHBAR_EVENT: 0xF5,
  OPEN_MIC: 0x0E,
  RECEIVE_MIC_DATA: 0xF1,
  SEND_AI_RESULT: 0x4E,
  SEND_BMP_PACKET: 0x15,
  BMP_TRANSMISSION_END: [0x20, 0x0d, 0x0e],
  CRC_CHECK: 0x16,
  TEXT_SENDING: 0x4E,
} as const;

// TouchBar Sub-commands
export const TOUCHBAR_SUBCMDS = {
  EXIT_TO_DASHBOARD: 0x00,
  SINGLE_TAP: 0x01,
  START_EVEN_AI: 0x17,
  STOP_EVEN_AI: 0x18,
  TRIPLE_TAP_SILENT: 0x04,
} as const;

// Screen Status Flags
export const SCREEN_STATUS = {
  NEW_CONTENT: 0x01,
  EVEN_AI_DISPLAYING: 0x30,
  EVEN_AI_COMPLETE: 0x40,
  EVEN_AI_MANUAL: 0x50,
  EVEN_AI_ERROR: 0x60,
  TEXT_SHOW: 0x70,
} as const;

// Response Status
export const RESPONSE_STATUS = {
  SUCCESS: 0xC9,
  FAILURE: 0xCA,
} as const;

export class SmartGlassesController {
  private leftBLE: any = null;
  private rightBLE: any = null;
  private eventEmitter: NativeEventEmitter | null = null;
  private isConnected = false;
  private currentSequence = 0;
  private audioBuffer: AudioPacket[] = [];
  private bleManager: BleManager | null = null;

  // Display configuration
  private readonly DISPLAY_WIDTH = 488;
  private readonly FONT_SIZE = 21;
  private readonly LINES_PER_SCREEN = 5;
  private readonly PACKET_SIZE = 194;
  private readonly BMP_ADDRESS = [0x00, 0x1c, 0x00, 0x00];

  constructor() {
    if (Platform.OS !== 'ios') {
      throw new Error('This controller is designed for iOS only');
    }

    try {
      // Initialize BLE manager
      this.bleManager = new BleManager();


      // Create event emitter using the BLE manager directly
      this.eventEmitter = new NativeEventEmitter(this.bleManager as any);

      // Setup event listeners
      this.setupEventListeners();

      // Log successful initialization
      console.log('BLE Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize BLE:', error);
      throw new Error('Failed to initialize Bluetooth. Please make sure Bluetooth is enabled and you have granted the necessary permissions.');
    }
  }


  private async GetBluetoothState(ble: BleManager): Promise<State> {
    console.log('Getting Bluetooth state');
    const state = await ble.state();
    console.log(state);
    if (state !== State.Unknown) {
      return state;
    }
    if (!this.bleManager) {
      throw new Error('BLE Manager not initialized');
    }
    return new Promise<State>((resolve) => {
      if (state !== State.Unknown) {
        console.log('Bluetooth state is not unknown');
        console.log(state);
        // If we can detect state immediately, return it
        resolve(state);
      }
      const subscription = this.bleManager!.onStateChange((state) => {
        subscription.remove();
        resolve(state);
      });
    });
  }

  // Connection Management
  async scanForGlasses(): Promise<GlassesDeviceInfo[]> {
    try {
      if (!this.bleManager) {
        throw new Error('BLE Manager not initialized');
      }

      console.log('Bluetooth is ready');
      await this.GetBluetoothState(this.bleManager);

      const devices: GlassesDeviceInfo[] = [];

      // Start scanning

      this.bleManager.startDeviceScan(null, null, (error, device) => {

        if (error) {
          console.error('Scan error:', error);
          throw error; // Propagate error to be handled by caller
        }


        if (device && device.name) {
          console.log('Device:', device.name);
          devices.push({
            id: device.id,
            name: device.name,
            rssi: device.rssi ?? undefined
          });
        }
      });

      // Stop scanning after 5 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      this.bleManager.stopDeviceScan();

      return devices;
    } catch (error) {
      console.error('Failed to scan for glasses:', error);
      throw error;
    }
  }

  async connectToGlasses(leftDeviceId: string, rightDeviceId: string): Promise<boolean> {
    try {
      // Connect to both BLE devices
      this.leftBLE = await this.connectToDevice(leftDeviceId);
      this.rightBLE = await this.connectToDevice(rightDeviceId);

      this.isConnected = true;
      this.setupNotifications();

      return true;
    } catch (error) {
      console.error('Failed to connect to glasses:', error);
      await this.disconnect();
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.leftBLE) {
        await this.leftBLE.cancelConnection();
        this.leftBLE = null;
      }
      if (this.rightBLE) {
        await this.rightBLE.cancelConnection();
        this.rightBLE = null;
      }
      this.isConnected = false;
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }

  // Even AI Functions
  async startEvenAI(): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      // Send microphone activation command to right side
      const command = Buffer.from([COMMANDS.OPEN_MIC, 0x01]);
      await this.sendToDevice(this.rightBLE, command);

      return true;
    } catch (error) {
      console.error('Failed to start Even AI:', error);
      return false;
    }
  }

  async stopEvenAI(): Promise<void> {
    if (!this.isConnected) return;

    try {
      const command = Buffer.from([COMMANDS.OPEN_MIC, 0x00]);
      await this.sendToDevice(this.rightBLE, command);
    } catch (error) {
      console.error('Failed to stop Even AI:', error);
    }
  }

  async sendAIResponse(response: AIResponse): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const textLines = this.splitTextIntoLines(response.text);
      const packets = this.createTextPackets(textLines);

      for (let i = 0; i < packets.length; i++) {
        const packet = this.createAIResponsePacket(
          packets[i],
          i,
          packets.length,
          0, // current page
          response.totalPages
        );

        // Send to left first, then right
        await this.sendToDevice(this.leftBLE, packet);
        await this.sendToDevice(this.rightBLE, packet);

        // Add delay between packets
        await this.delay(100);
      }

      return true;
    } catch (error) {
      console.error('Failed to send AI response:', error);
      return false;
    }
  }

  // Image Transmission
  async sendBMPImage(imageData: BMPImageData): Promise<boolean> {
    if (!this.isConnected) return false;

    // Validate image width
    if (imageData.width > this.DISPLAY_WIDTH) {
      console.error('Image width exceeds display width limit of 488 pixels');
      return false;
    }

    try {
      const packets = this.createBMPPackets(imageData.data);

      // Send packets sequentially - left side first, then right
      for (let i = 0; i < packets.length; i++) {
        // Send to left side and wait for acknowledgment
        await this.sendToDevice(this.leftBLE, packets[i]);
        
        // After left side acknowledges, send to right side
        await this.sendToDevice(this.rightBLE, packets[i]);
        
        await this.delay(5); // Small delay between packets
      }

      // Send transmission end command - left then right
      const endCommand = Buffer.from(COMMANDS.BMP_TRANSMISSION_END);
      await this.sendToDevice(this.leftBLE, endCommand);
      await this.sendToDevice(this.rightBLE, endCommand);

      // Send CRC check - left then right
      const crc = this.calculateCRC32(imageData.data);
      const crcCommand = Buffer.from([COMMANDS.CRC_CHECK, ...this.uint32ToBytes(crc)]);
      await this.sendToDevice(this.leftBLE, crcCommand);
      await this.sendToDevice(this.rightBLE, crcCommand);

      return true;
    } catch (error) {
      console.error('Failed to send BMP image:', error);
      return false;
    }
  }

  // Text Transmission
  async sendText(text: string): Promise<boolean> {

    if (!this.isConnected) return false;
    console.log('Sending text:', text);
    try {
      const textLines = this.splitTextIntoLines(text);
      const screens = this.splitIntoScreens(textLines);

      for (let screenIndex = 0; screenIndex < screens.length; screenIndex++) {
        const packets = this.createTextPackets(screens[screenIndex]);

        for (let packetIndex = 0; packetIndex < packets.length; packetIndex++) {
          const packet = this.createTextPacket(
            packets[packetIndex],
            packetIndex,
            packets.length,
            screenIndex,
            screens.length
          );

          await this.sendToDevice(this.leftBLE, packet);
          await this.sendToDevice(this.rightBLE, packet);
          await this.delay(100);
        }

        // Delay between screens
        await this.delay(500);
      }

      return true;
    } catch (error) {
      console.error('Failed to send text:', error);
      return false;
    }
  }

  // Event Handlers
  private setupEventListeners(): void {
    if (!this.eventEmitter) return;

    this.eventEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
      this.handleIncomingData(data);
    });
  }

  private handleIncomingData(data: any): void {
    console.log('Incoming data:', data);
    const command = data.value[0];

    switch (command) {
      case COMMANDS.TOUCHBAR_EVENT:
        this.handleTouchBarEvent(data.value);
        break;
      case COMMANDS.RECEIVE_MIC_DATA:
        this.handleMicData(data.value);
        break;
      default:
        console.log('Unknown command received:', command);
    }
  }

  private handleTouchBarEvent(data: Uint8Array): void {
    const subCommand = data[1];
    let eventType: TouchBarEvent['type'];

    console.log('Touchbar event received:', subCommand);

    switch (subCommand) {
      case TOUCHBAR_SUBCMDS.SINGLE_TAP:
        eventType = 'single';
        break;
      case TOUCHBAR_SUBCMDS.EXIT_TO_DASHBOARD:
        eventType = 'double';
        break;
      case TOUCHBAR_SUBCMDS.TRIPLE_TAP_SILENT:
        eventType = 'triple';
        break;
      default:
        return;
    }

    // Emit event for app to handle
    this.emit('touchbar', { type: eventType, side: 'left' }); // Determine side based on context
  }

  private handleMicData(data: Uint8Array): void {
    const sequence = data[1];
    const audioData = data.slice(2);

    this.audioBuffer.push({
      sequence,
      data: audioData
    });

    this.emit('audioData', { sequence, data: audioData });
  }

  // Utility Methods
  private async connectToDevice(deviceId: string): Promise<any> {
    try {
      if (!this.bleManager) {
        throw new Error('BLE Manager not initialized');
      }
      const device = await this.bleManager.connectToDevice(deviceId);
      if (!device) {
        throw new Error('Failed to connect to device');
      }

      // Discover all services and characteristics
      await device.discoverAllServicesAndCharacteristics();

      // Log all services and characteristics for debugging
      const services = await device.services();
      console.log('Available services:', services);

      for (const service of services) {
        const characteristics = await service.characteristics();
        console.log(`Characteristics for service ${service.uuid}:`, characteristics);
      }

      return device;
    } catch (error) {
      console.error(`Failed to connect to device ${deviceId}:`, error);
      throw error;
    }
  }

  private async sendToDevice(device: any, data: Buffer): Promise<void> {
    try {
      // Nordic UART Service (NUS) UUIDs
      const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
      const NUS_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write characteristic
      const NUS_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Read characteristic

      // Get the NUS service
      const services = await device.services();
      const nusService = services.find((service: { uuid: string }) => 
        service.uuid.toLowerCase() === NUS_SERVICE_UUID.toLowerCase()
      );
      
      if (!nusService) {
        throw new Error('Nordic UART Service not found on device');
      }

      // Get the TX (write) characteristic
      const characteristics = await nusService.characteristics();
      const txCharacteristic = characteristics.find((char: { uuid: string }) => 
        char.uuid.toLowerCase() === NUS_TX_CHARACTERISTIC_UUID.toLowerCase()
      );

      if (!txCharacteristic) {
        throw new Error('TX characteristic not found on NUS service');
      }

      console.log('Using NUS service:', nusService.uuid);
      console.log('Using TX characteristic:', txCharacteristic.uuid);

      // Write the data without response
      await device.writeCharacteristicWithoutResponseForService(
        nusService.uuid,
        txCharacteristic.uuid,
        data.toString('base64')
      );

      // Add a small delay to ensure the write completes
      await this.delay(100);
    } catch (error) {
      console.error('Failed to send data to device:', error);
      throw error;
    }
  }

  private setupNotifications(): void {
    // Setup BLE characteristic notifications
    // Implementation depends on your BLE library
  }

  private splitTextIntoLines(text: string): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      // Rough character width calculation based on display width and font size
      if (testLine.length * (this.FONT_SIZE * 0.6) <= this.DISPLAY_WIDTH) {
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

    for (let i = 0; i < lines.length; i += this.LINES_PER_SCREEN) {
      screens.push(lines.slice(i, i + this.LINES_PER_SCREEN));
    }

    return screens;
  }

  private createTextPackets(lines: string[]): Buffer[] {
    const packets: Buffer[] = [];
    const text = lines.join('\n');
    const textBuffer = Buffer.from(text, 'utf8');

    for (let i = 0; i < textBuffer.length; i += this.PACKET_SIZE - 10) { // Reserve space for headers
      const chunk = textBuffer.slice(i, i + this.PACKET_SIZE - 10);
      packets.push(chunk);
    }

    return packets;
  }

  private createTextPacket(
    data: Buffer,
    currentPacket: number,
    totalPackets: number,
    currentPage: number,
    maxPages: number
  ): Buffer {
    const sequence = this.getNextSequence();
    const newScreen = SCREEN_STATUS.NEW_CONTENT | SCREEN_STATUS.TEXT_SHOW;

    const header = Buffer.from([
      COMMANDS.TEXT_SENDING,
      sequence,
      totalPackets,
      currentPacket,
      newScreen,
      0, // new_char_pos0
      0, // new_char_pos1
      currentPage,
      maxPages
    ]);

    return Buffer.concat([header, data]);
  }

  private createAIResponsePacket(
    data: Buffer,
    currentPacket: number,
    totalPackets: number,
    currentPage: number,
    maxPages: number
  ): Buffer {
    const sequence = this.getNextSequence();
    const newScreen = SCREEN_STATUS.NEW_CONTENT | SCREEN_STATUS.EVEN_AI_DISPLAYING;

    const header = Buffer.from([
      COMMANDS.SEND_AI_RESULT,
      sequence,
      totalPackets,
      currentPacket,
      newScreen,
      0, // new_char_pos0
      0, // new_char_pos1
      currentPage,
      maxPages
    ]);

    return Buffer.concat([header, data]);
  }

  private createBMPPackets(imageData: Uint8Array): Buffer[] {
    const packets: Buffer[] = [];
    const totalPackets = Math.ceil(imageData.length / this.PACKET_SIZE);

    for (let i = 0; i < imageData.length; i += this.PACKET_SIZE) {
      const chunk = imageData.slice(i, i + this.PACKET_SIZE);
      const packetIndex = Math.floor(i / this.PACKET_SIZE);

      if (packetIndex === 0) {
        // First packet needs storage address
        packets.push(Buffer.concat([
          Buffer.from([COMMANDS.SEND_BMP_PACKET, packetIndex & 0xff]), // Command and index
          Buffer.from([0x00, 0x1c, 0x00, 0x00]), // Storage address
          Buffer.from(chunk)
        ]));
      } else {
        // Other packets just need command and index
        packets.push(Buffer.concat([
          Buffer.from([COMMANDS.SEND_BMP_PACKET, packetIndex & 0xff]),
          Buffer.from(chunk)
        ]));
      }
    }

    return packets;
  }

  private createBMPPacket(data: Buffer, sequence: number, isFirst: boolean): Buffer {
    let header: Buffer;

    if (isFirst) {
      header = Buffer.from([
        COMMANDS.SEND_BMP_PACKET,
        sequence & 0xff,
        ...this.BMP_ADDRESS
      ]);
    } else {
      header = Buffer.from([
        COMMANDS.SEND_BMP_PACKET,
        sequence & 0xff
      ]);
    }

    return Buffer.concat([header, data]);
  }

  private calculateCRC32(data: Uint8Array): number {
    // CRC32-XZ implementation
    const polynomial = 0x04C11DB7;
    let crc = 0xFFFFFFFF;

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

    return (~crc) >>> 0; // Convert to unsigned 32-bit
  }

  private uint32ToBytes(value: number): number[] {
    return [
      (value >>> 24) & 0xFF,
      (value >>> 16) & 0xFF,
      (value >>> 8) & 0xFF,
      value & 0xFF
    ];
  }

  private getNextSequence(): number {
    this.currentSequence = (this.currentSequence + 1) % 256;
    return this.currentSequence;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private emit(event: string, data: any): void {
    // Emit events for the React Native app to listen to
    this.eventEmitter?.emit(event, data);
  }

  // Public event listener methods
  onTouchBar(callback: (event: TouchBarEvent) => void): void {
    this.eventEmitter?.addListener('touchbar', callback);
  }

  onAudioData(callback: (data: AudioPacket) => void): void {
    this.eventEmitter?.addListener('audioData', callback);
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.eventEmitter?.addListener('connectionChange', callback);
  }

  // Cleanup
  removeAllListeners(): void {
    this.eventEmitter?.removeAllListeners('touchbar');
    this.eventEmitter?.removeAllListeners('audioData');
    this.eventEmitter?.removeAllListeners('connectionChange');
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }

  get audioBufferLength(): number {
    return this.audioBuffer.length;
  }

  clearAudioBuffer(): void {
    this.audioBuffer = [];
  }
}