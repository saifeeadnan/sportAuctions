import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ThemedText type="title" style={styles.heading}>
        Profile
      </ThemedText>

      <View style={styles.identityRow}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="person" size={28} color={theme.accent} />
        </View>
        <View>
          <ThemedText type="smallBold">{user?.name}</ThemedText>
          {user?.isSiteAdmin && <Badge tone="accent">Site admin</Badge>}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="label" themeColor="textSecondary">
          Leagues
        </ThemedText>
        {user?.memberships.length ? (
          user.memberships.map((m) => (
            <Card key={m.leagueId} style={styles.membershipRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.leagueId}>
                {m.leagueId}
              </ThemedText>
              <Badge tone="neutral">{m.role}</Badge>
            </Card>
          ))
        ) : (
          <ThemedText themeColor="textSecondary">No league memberships.</ThemedText>
        )}
      </View>

      <Button variant="danger" onPress={logout}>
        Log out
      </Button>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.three, gap: Spacing.four },
  heading: { fontSize: 28, lineHeight: 34 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  avatar: { width: 56, height: 56, borderRadius: Radius.large, alignItems: "center", justifyContent: "center" },
  section: { gap: Spacing.two },
  membershipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leagueId: { flexShrink: 1 },
});
