// Layout constants
export const HEADER_HEIGHT = 1;
export const FOOTER_HEIGHT = 1;
export const MIN_ROWS = 12;
export const TARGET_LINES_PER_ITEM = 2;

// Data limits
export const LOG_MAX_LINES = 5000;
export const NET_MAX_ITEMS = 1500;
export const PROPERTY_LIMIT = 80;
export const HEADER_LIMIT = 120;
export const BODY_LINE_LIMIT = 300;

// Nerd Font Icons (requires a Nerd Font patched terminal font)
export const ICONS = {
  // UI Elements
  logo: "\ueb8e", // nf-cod-terminal
  connected: "\uea71", // nf-cod-circle_filled
  disconnected: "\uea72", // nf-cod-circle_outline
  bullet: "\ueab6", // nf-cod-chevron_right
  expand: "\ueab4", // nf-cod-chevron_down
  collapse: "\ueab6", // nf-cod-chevron_right
  star: "\ueb59", // nf-cod-star_full

  // Targets
  page: "\ueb01", // nf-cod-globe
  file: "\ueaf4", // nf-cod-file
  gear: "\ueb51", // nf-cod-settings_gear (gear)
  window: "\ueb14", // nf-cod-window
  mobile: "\uea8a", // nf-cod-device_mobile
  worker: "\ueb36", // nf-cod-person
  link: "\ueb15", // nf-cod-link
  plug: "\ueb39", // nf-cod-plug

  // Actions
  search: "\uea6d", // nf-cod-search
  zap: "\ueb6c", // nf-cod-zap
  list: "\ueb85", // nf-cod-list_flat
  network: "\uf484", // nf-md-web

  // Status
  check: "\ueab2", // nf-cod-check
  error: "\ueae2", // nf-cod-error
  warning: "\uea6c", // nf-cod-warning
  info: "\uea74", // nf-cod-info
} as const;

// Target type icons mapping
export const TARGET_ICONS: Record<string, string> = {
  page: ICONS.page,
  background_page: ICONS.file,
  service_worker: ICONS.gear,
  iframe: ICONS.window,
  webview: ICONS.mobile,
  worker: ICONS.worker,
  shared_worker: ICONS.link,
  other: ICONS.plug,
};

// ASCII Art Logo
export const LOGO_ART = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║ 
║   ████████╗███████╗██████╗ ███╗   ███╗██████╗ ███████╗██╗   ██╗   ║
║   ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔══██╗██╔════╝██║   ██║   ║
║      ██║   █████╗  ██████╔╝██╔████╔██║██║  ██║█████╗  ██║   ██║   ║
║      ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║  ██║██╔══╝  ╚██╗ ██╔╝   ║
║      ██║   ███████╗██║  ██║██║ ╚═╝ ██║██████╔╝███████╗ ╚████╔╝    ║
║      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚══════╝  ╚═══╝     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;

export const LOGO_SUBTITLE = " Terminal DevTools for Chrome DevTools Protocol";
export const LOGO_HINT = " Press any key to continue...";

// Color palettes
export const RAINBOW_COLORS = [
  "#FF6B6B",
  "#FFE66D",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#DDA0DD",
  "#FF6B6B",
] as const;

export const HEADER_GRADIENT_COLORS = ["#00D9FF", "#00FF94", "#FFE600"] as const;
export const SUBTITLE_GRADIENT_COLORS = ["#4ECDC4", "#45B7D1", "#96CEB4"] as const;
export const HINT_GRADIENT_COLORS = ["#888888", "#aaaaaa", "#888888"] as const;
