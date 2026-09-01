import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Radius, Spacing } from "@/constants/theme";

export type BadgeTone = "success" | "danger" | "live" | "neutral" | "accent";

/** A small status pill — used for auction/player/team status everywhere
 * (BIDDING, SOLD, UNSOLD, "Live", eligibility state, etc.) so status always
 * reads as a color + shape at a glance, not just plain text buried in a row.
 * "live" gets a softly pulsing dot — the one animated flourish in the app,
 * reserved for "this is happening right now." */
export function Badge({ tone = "neutral", children, dot }: { tone?: BadgeTone; children: string; dot?: boolean }) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (tone !== "live") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [tone, pulse]);

  const { fg, bg } = toneColors(theme, tone);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {(dot ?? tone === "live") && (
        <Animated.View style={[styles.dot, { backgroundColor: fg, opacity: tone === "live" ? pulse : 1 }]} />
      )}
      <ThemedText type="label" style={{ color: fg }}>
        {children}
      </ThemedText>
    </View>
  );
}

function toneColors(theme: ReturnType<typeof useTheme>, tone: BadgeTone) {
  switch (tone) {
    case "success":
      return { fg: theme.success, bg: theme.successBg };
    case "danger":
      return { fg: theme.danger, bg: theme.dangerBg };
    case "live":
      return { fg: theme.live, bg: theme.liveBg };
    case "accent":
      return { fg: theme.accent, bg: theme.backgroundSelected };
    default:
      return { fg: theme.textSecondary, bg: theme.neutralBg };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
