import { ActivityIndicator, Pressable, StyleSheet, type GestureResponderEvent } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Radius, Spacing } from "@/constants/theme";

type ButtonVariant = "primary" | "outline" | "danger";

export function Button({
  children,
  onPress,
  disabled,
  loading,
  variant = "primary",
}: {
  children: string;
  onPress: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
}) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle =
    variant === "primary"
      ? { backgroundColor: theme.accent, borderColor: theme.accent }
      : variant === "danger"
        ? { backgroundColor: "transparent", borderColor: theme.danger }
        : { backgroundColor: "transparent", borderColor: theme.border };

  const textColor = variant === "primary" ? theme.accentText : variant === "danger" ? theme.danger : theme.text;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyle,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText style={[styles.text, { color: textColor }]}>{children}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    alignSelf: "stretch",
  },
  text: { fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
