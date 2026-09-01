import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auctions/[id]" options={{ title: "Live Auction" }} />
      <Stack.Screen name="fantasy/[id]" options={{ title: "Fantasy Team" }} />
    </Stack>
  );
}
