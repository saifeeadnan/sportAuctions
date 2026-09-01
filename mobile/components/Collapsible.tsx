import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

/** Mobile equivalent of the web's <details>/<summary> sections used on the
 * fantasy team page ("Build", "Current team (N)") — same default-open vs.
 * default-closed behavior per section, just tap-to-expand instead. */
export function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.header}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.textSecondary} />
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.three },
});
