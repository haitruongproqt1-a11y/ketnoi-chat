import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import type { OpaqueColorValue, StyleProp, TextStyle } from "react-native";

export type IconSymbolName =
  | "message.fill" | "person.2.fill" | "phone.fill" | "person.crop.circle" | "magnifyingglass"
  | "square.and.pencil" | "video.fill" | "paperclip" | "mic.fill" | "paperplane.fill"
  | "chevron.left" | "ellipsis" | "plus" | "camera.fill" | "bell.fill" | "checkmark"
  | "checkmark.double" | "phone.down.fill" | "speaker.wave.2.fill" | "speaker.slash.fill"
  | "video.slash.fill" | "mic.slash.fill" | "camera.rotate.fill" | "rectangle.on.rectangle"
  | "person.badge.plus" | "lock.fill" | "wifi" | "chevron.right" | "heart.fill" | "gearshape.fill" | "arrow.up" | "house.fill";

const MAPPING: Record<IconSymbolName, ComponentProps<typeof MaterialIcons>["name"]> = {
  "message.fill": "chat-bubble", "person.2.fill": "groups", "phone.fill": "phone", "person.crop.circle": "account-circle", "magnifyingglass": "search",
  "square.and.pencil": "edit-square", "video.fill": "videocam", "paperclip": "attach-file", "mic.fill": "mic", "paperplane.fill": "send",
  "chevron.left": "chevron-left", ellipsis: "more-horiz", plus: "add", "camera.fill": "camera-alt", "bell.fill": "notifications-none", checkmark: "done",
  "checkmark.double": "done-all", "phone.down.fill": "call-end", "speaker.wave.2.fill": "volume-up", "speaker.slash.fill": "volume-off",
  "video.slash.fill": "videocam-off", "mic.slash.fill": "mic-off", "camera.rotate.fill": "flip-camera-android", "rectangle.on.rectangle": "screen-share",
  "person.badge.plus": "person-add", "lock.fill": "lock", wifi: "wifi", "chevron.right": "chevron-right", "heart.fill": "favorite", "gearshape.fill": "settings", "arrow.up": "arrow-upward", "house.fill": "home",
};

export function IconSymbol({ name, size = 24, color, style, weight: _weight }: { name: IconSymbolName; size?: number; color: string | OpaqueColorValue; style?: StyleProp<TextStyle>; weight?: string }) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
