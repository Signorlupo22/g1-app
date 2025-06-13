#!/bin/bash

# Path to the project file
PROJECT_FILE="g1-app.xcodeproj/project.pbxproj"
INFO_PLIST="g1-app/Info.plist"

# Add Bluetooth capability to project.pbxproj
if [ -f "$PROJECT_FILE" ]; then
    echo "Configuring project.pbxproj..."
    
    # Add SystemCapabilities section if it doesn't exist
    if ! grep -q "SystemCapabilities = {" "$PROJECT_FILE"; then
        sed -i '' '/buildSettings = {/a\
            SystemCapabilities = {\
                com.apple.BluetoothCentral = {\
                    enabled = 1;\
                };\
            };' "$PROJECT_FILE"
    fi
fi

# Configure Info.plist
if [ -f "$INFO_PLIST" ]; then
    echo "Configuring Info.plist..."
    
    # Add Bluetooth usage descriptions
    /usr/libexec/PlistBuddy -c "Add :NSBluetoothAlwaysUsageDescription string 'This app needs Bluetooth access to connect to smart glasses'" "$INFO_PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :NSBluetoothPeripheralUsageDescription string 'This app needs Bluetooth access to connect to smart glasses'" "$INFO_PLIST" 2>/dev/null || true
    
    # Add background modes
    /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" "$INFO_PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string bluetooth-central" "$INFO_PLIST" 2>/dev/null || true
fi

echo "BLE configuration completed" 