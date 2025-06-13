#!/bin/bash

# Enable Bluetooth capabilities in Xcode project
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" ios/g1-app/Info.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string bluetooth-central" ios/g1-app/Info.plist 2>/dev/null || true

# Add Bluetooth usage descriptions if they don't exist
/usr/libexec/PlistBuddy -c "Add :NSBluetoothAlwaysUsageDescription string 'This app needs Bluetooth access to connect to smart glasses'" ios/g1-app/Info.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSBluetoothPeripheralUsageDescription string 'This app needs Bluetooth access to connect to smart glasses'" ios/g1-app/Info.plist 2>/dev/null || true

# Add Bluetooth background mode
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:1 string bluetooth-central" ios/g1-app/Info.plist 2>/dev/null || true

# Add Bluetooth capability to project.pbxproj
PROJECT_FILE="ios/g1-app.xcodeproj/project.pbxproj"
if [ -f "$PROJECT_FILE" ]; then
    # Add Bluetooth capability if it doesn't exist
    if ! grep -q "SystemCapabilities.*com.apple.BluetoothCentral" "$PROJECT_FILE"; then
        echo "Adding Bluetooth capability to project..."
        # This is a simplified version - you might need to adjust the exact format
        sed -i '' '/SystemCapabilities = {/a\
            com.apple.BluetoothCentral = {\
                enabled = 1;\
            };' "$PROJECT_FILE"
    fi
fi

echo "BLE capabilities have been enabled in the Xcode project" 