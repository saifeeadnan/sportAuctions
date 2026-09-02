import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/services/apiClient";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Collapsible } from "@/components/Collapsible";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
  ];
}

function UpdateProfileSection() {
  const { user, refreshUser } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch("/api/mobile/me", {
        method: "PATCH",
        body: JSON.stringify({ email: email.trim(), phone: phone.trim() }),
      });
      await refreshUser();
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Collapsible title="Update profile">
      <View style={styles.fieldGroup}>
        <ThemedText type="label" themeColor="textSecondary">
          Email
        </ThemedText>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={inputStyle(theme)}
        />
      </View>
      <View style={styles.fieldGroup}>
        <ThemedText type="label" themeColor="textSecondary">
          Phone
        </ThemedText>
        <TextInput
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          style={inputStyle(theme)}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Helps a league admin find and re-associate your login if you ever need to join another
        league without registering again.
      </ThemedText>
      {error && (
        <ThemedView type="dangerBg" style={styles.messageBox}>
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        </ThemedView>
      )}
      {success && (
        <ThemedView type="successBg" style={styles.messageBox}>
          <ThemedText type="small" themeColor="success">
            Contact info updated.
          </ThemedText>
        </ThemedView>
      )}
      <Button onPress={handleSave} loading={loading}>
        Save
      </Button>
    </Collapsible>
  );
}

function ChangePasswordSection() {
  const theme = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/mobile/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Collapsible title="Change password">
      <View style={styles.fieldGroup}>
        <ThemedText type="label" themeColor="textSecondary">
          Current password
        </ThemedText>
        <TextInput
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          style={inputStyle(theme)}
        />
      </View>
      <View style={styles.fieldGroup}>
        <ThemedText type="label" themeColor="textSecondary">
          New password
        </ThemedText>
        <TextInput
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          style={inputStyle(theme)}
        />
      </View>
      <View style={styles.fieldGroup}>
        <ThemedText type="label" themeColor="textSecondary">
          Confirm new password
        </ThemedText>
        <TextInput
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={inputStyle(theme)}
        />
      </View>
      {error && (
        <ThemedView type="dangerBg" style={styles.messageBox}>
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        </ThemedView>
      )}
      {success && (
        <ThemedView type="successBg" style={styles.messageBox}>
          <ThemedText type="small" themeColor="success">
            Password changed successfully.
          </ThemedText>
        </ThemedView>
      )}
      <Button
        onPress={handleSave}
        loading={loading}
        disabled={!currentPassword || !newPassword || !confirmPassword}
      >
        Change password
      </Button>
    </Collapsible>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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

        <UpdateProfileSection />
        <ChangePasswordSection />

        <View style={styles.section}>
          <ThemedText type="label" themeColor="textSecondary">
            Leagues
          </ThemedText>
          {user?.memberships.length ? (
            user.memberships.map((m) => (
              <Card key={m.leagueId} style={styles.membershipRow}>
                <ThemedText type="small" style={styles.leagueName}>
                  {m.leagueName}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.three },
  scrollContent: { gap: Spacing.four, paddingBottom: Spacing.six },
  heading: { fontSize: 28, lineHeight: 34 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  avatar: { width: 56, height: 56, borderRadius: Radius.large, alignItems: "center", justifyContent: "center" },
  section: { gap: Spacing.two },
  membershipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leagueName: { flexShrink: 1 },
  fieldGroup: { gap: Spacing.one },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  messageBox: {
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
