import { StyleSheet, View } from "react-native";
import { useLotTimer } from "@/hooks/useLotTimer";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

/** Mirrors components/auction/OnClockTimer.tsx — visual-only countdown,
 * renders nothing when this auction has no timer configured. */
export function OnClockTimer({
  player,
  totalSeconds,
}: {
  player: { lotTimerDeadline: string | null };
  totalSeconds: number | null;
}) {
  const theme = useTheme();
  const { secondsRemaining, timeUp } = useLotTimer(player);
  if (secondsRemaining == null) return null;

  const pct = totalSeconds ? Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100)) : 100;

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" themeColor={timeUp ? "danger" : "text"}>
        {timeUp ? "Time's up" : `${secondsRemaining}s`}
      </ThemedText>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: timeUp ? theme.danger : theme.success }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: Spacing.half, alignSelf: "stretch" },
  track: { height: 6, borderRadius: 3, alignSelf: "stretch", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});
