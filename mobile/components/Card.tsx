import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { Radius, Spacing } from "@/constants/theme";

/** The one card container used everywhere (auction rows, on-clock panel,
 * team stat blocks, fantasy rows) — a subtle border instead of a shadow, so
 * it reads consistently in both themes without a shadow color mismatch. */
export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
