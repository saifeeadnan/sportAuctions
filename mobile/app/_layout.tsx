import "react-native-reanimated";
import { useRef } from "react";
import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { SplashScreen, Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { queryClient } from "@/services/queryClient";
import { Colors } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <SplashScreenController />
        <RootNavigator />
      </QueryClientProvider>
    </AuthProvider>
  );
}

// expo-router's own SplashScreen wrapper, not expo-splash-screen's directly —
// calling .hide() synchronously in render (not inside a useEffect) is the
// documented fix for "No native splash screen registered for the given view
// controller" (docs.expo.dev/router/advanced/authentication). That export's
// own hide() has no internal guard against being called more than once, and
// this component sits under QueryClientProvider — which re-renders as
// queries settle during login — so a ref stops it from calling hide() again
// on every subsequent re-render once it's already hidden.
function SplashScreenController() {
  const { isLoading } = useAuth();
  const hidden = useRef(false);
  if (!isLoading && !hidden.current) {
    hidden.current = true;
    SplashScreen.hide();
  }
  return null;
}

// Without this, React Navigation's Stack/Tabs chrome (tab bar, headers, safe
// area backgrounds) falls back to its own uncontrolled default theme instead
// of following the system color scheme — while ThemedText/ThemedView (this
// app's own content) correctly do follow it via useTheme(). On a dark-mode
// device that mismatch is exactly "gray background, white text": native
// chrome staying light/neutral gray underneath text that's already gone
// white. Spreading the built-in Default/DarkTheme (for v7's required `fonts`
// field) and overriding just the colors keeps both in sync with this app's
// own palette.
function useNavigationTheme() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: { ...base.colors, background: colors.background, text: colors.text, card: colors.backgroundElement },
  };
}

function RootNavigator() {
  const { token, isLoading } = useAuth();
  const navigationTheme = useNavigationTheme();

  if (isLoading) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!token}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!token}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
