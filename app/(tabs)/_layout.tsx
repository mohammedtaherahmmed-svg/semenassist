import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { COLORS } from "@/components/clinical-ui";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.tealDark,
        tabBarInactiveTintColor: "#7A8B99",
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          paddingTop: 7,
          paddingBottom: bottomPadding,
          height: 62 + bottomPadding,
          backgroundColor: COLORS.paper,
          borderTopColor: COLORS.line,
          borderTopWidth: 1,
          elevation: 12,
          shadowColor: "#18364A",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarItemStyle: {
          paddingTop: 2,
          paddingBottom: 1,
        },
        tabBarIconStyle: {
          marginBottom: 1,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          lineHeight: 12,
          fontWeight: "700",
          marginTop: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="samples" options={{ title: "العينات", tabBarIcon: ({ color }) => <IconSymbol size={22} name="doc.text.fill" color={color} /> }} />
      <Tabs.Screen name="calibration" options={{ title: "المعايرة", tabBarIcon: ({ color }) => <IconSymbol size={22} name="scope" color={color} /> }} />
      <Tabs.Screen name="validation" options={{ title: "التحقق", tabBarIcon: ({ color }) => <IconSymbol size={22} name="checkmark.seal.fill" color={color} /> }} />
      <Tabs.Screen name="morphology" options={{ title: "الصور", tabBarIcon: ({ color }) => <IconSymbol size={22} name="photo.fill" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "الإعدادات", tabBarIcon: ({ color }) => <IconSymbol size={22} name="gearshape.fill" color={color} /> }} />
    </Tabs>
  );
}
