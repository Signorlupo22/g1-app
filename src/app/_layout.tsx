import 'react-native-reanimated'; // deve essere il PRIMO import

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useColorScheme } from 'react-native';
import { ThemeProvider as CustomThemeProvider } from "../theme/ThemeProvider";

const DarkThemeCustom = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        primary: "#00FF41",
        card: "#101010",
        button: "#00FF41"

    }
}

const LightThemeCustom = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        primary: "#00FF41",
        card: "#ffffff",
        button: "#00FF41"
    }
}

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const theme = colorScheme === 'dark' ? DarkThemeCustom : LightThemeCustom;

    return (
        <ThemeProvider value={theme}>
            <CustomThemeProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="index" />
                    </Stack>
            </CustomThemeProvider>
        </ThemeProvider>
    )
}