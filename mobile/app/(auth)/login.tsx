import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/Button";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const result = await login(loginId.trim(), password);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.iconBadge, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="hammer" size={30} color={theme.accent} />
        </View>
        <View style={styles.heading}>
          <ThemedText type="title" style={styles.title}>
            Welcome back
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Sign in to view auctions, bid live, and build your fantasy team.
          </ThemedText>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <ThemedText type="label" themeColor="textSecondary">
              Login ID
            </ThemedText>
            <TextInput
              placeholder="yourname"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={loginId}
              onChangeText={setLoginId}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="label" themeColor="textSecondary">
              Password
            </ThemedText>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            />
          </View>

          {error && (
            <ThemedView type="dangerBg" style={styles.errorBox}>
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            </ThemedView>
          )}

          <Button onPress={handleSubmit} loading={loading} disabled={!loginId || !password}>
            Sign in
          </Button>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: "center", paddingHorizontal: Spacing.four, gap: Spacing.five },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: Radius.large,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  heading: { gap: Spacing.one, alignItems: "center" },
  title: { fontSize: 30, lineHeight: 36 },
  subtitle: { textAlign: "center", maxWidth: 280 },
  form: { gap: Spacing.three },
  fieldGroup: { gap: Spacing.one },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    fontSize: 16,
  },
  errorBox: {
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
