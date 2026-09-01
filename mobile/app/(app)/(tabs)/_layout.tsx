import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";

export default function AppTabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Auctions", tabBarIcon: ({ color, size }) => <Ionicons name="hammer" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="fantasy"
        options={{ title: "Fantasy", tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
