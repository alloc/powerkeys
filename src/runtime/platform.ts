import type { Platform } from "../types/internal";

export function detectPlatform(): Platform {
  const platform = typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
  if (
    platform.includes("mac") ||
    platform.includes("iphone") ||
    platform.includes("ipad") ||
    platform.includes("ipod")
  ) {
    return "mac";
  }
  if (platform.includes("win")) {
    return "windows";
  }
  if (platform.includes("linux")) {
    return "linux";
  }
  return "other";
}
