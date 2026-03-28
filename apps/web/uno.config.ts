import { defineConfig, presetIcons, presetUno, presetTypography } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetIcons(), presetTypography()],
  theme: {
    colors: {
      primary: "var(--color-primary)",
      secondary: "var(--color-secondary)",
      tertiary: "var(--color-tertiary)",
      "accent-blue": "var(--color-accent-blue)",
      "accent-orange": "var(--color-accent-orange)",
      "accent-green": "var(--color-accent-green)",
      "accent-pink": "var(--color-accent-pink)",
      "accent-indigo": "var(--color-accent-indigo)",
      surface: "var(--color-surface)",
      "surface-hover": "var(--color-surface-hover)",
      "surface-gray": "var(--color-surface-gray)",
      edge: "var(--color-edge)",
      "edge-light": "var(--color-edge-light)",
      "error-bg": "var(--color-error-bg)",
      "error-border": "var(--color-error-border)",
      "error-text": "var(--color-error-text)",
    },
    fontFamily: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
      serif: 'Lyon-Text, Georgia, ui-serif, "Nimbus Roman No9 L", "Songti SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif CN", STSong, "AR PL New Sung", "AR PL UMing CN", SimSun, "WenQuanYi Bitmap Song", "AR PL UKai CN", serif',
      display: 'Lyon-Text, Georgia, serif',
    },
  },
  shortcuts: [
    // Glass surfaces
    [
      "n-glass",
      "bg-surface backdrop-blur-[40px] border border-white/[0.03]",
    ],
    [
      "n-glass-card",
      "bg-surface backdrop-blur-[24px] saturate-180 border border-edge rounded-3xl transition-all duration-600 shadow-[0_4px_24px_-1px_rgba(0,0,0,0.1),0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-surface-hover hover:border-accent-indigo hover:translate-y-[-4px] hover:scale-[1.01] hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.2),0_10px_15px_-3px_rgba(139,92,246,0.15)]",
    ],
    // Form inputs
    [
      "n-input",
      "w-full rounded border border-white/5 bg-surface-gray text-primary px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-tertiary focus:border-accent-blue focus:bg-[var(--color-base-bg)]",
    ],
    [
      "n-toggle",
      "rounded border border-edge px-3 py-1 text-sm font-medium bg-surface-gray text-secondary cursor-pointer transition-all duration-200 hover:bg-surface-hover hover:border-tertiary",
    ],
    // Tag variants for PlanResult
    [
      "n-tag-blue",
      "bg-[var(--color-tag-blue-bg)] text-[var(--color-tag-blue-text)] border border-[rgba(54,148,242,0.2)]",
    ],
    [
      "n-tag-green",
      "bg-[var(--color-tag-green-bg)] text-[var(--color-tag-green-text)] border border-[rgba(68,179,165,0.2)]",
    ],
    [
      "n-tag-pink",
      "bg-[var(--color-tag-pink-bg)] text-[var(--color-tag-pink-text)] border border-[rgba(217,87,160,0.2)]",
    ],
    [
      "n-tag-orange",
      "bg-[var(--color-tag-orange-bg)] text-[var(--color-tag-orange-text)] border border-[rgba(242,166,94,0.2)]",
    ],
    [
      "n-tag-indigo",
      "bg-[var(--color-tag-indigo-bg)] text-[var(--color-tag-indigo-text)] border border-[rgba(123,132,249,0.2)]",
    ],
    // Pressed-state color tags (for form toggles)
    [
      "n-tag--green",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-green aria-pressed:bg-[var(--color-tag-green-bg)] aria-pressed:text-[var(--color-tag-green-text)]",
    ],
    [
      "n-tag--cyan",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-blue aria-pressed:bg-[var(--color-tag-blue-bg)] aria-pressed:text-[var(--color-tag-blue-text)]",
    ],
    [
      "n-tag--blue",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-blue aria-pressed:bg-[var(--color-tag-blue-bg)] aria-pressed:text-[var(--color-tag-blue-text)]",
    ],
    [
      "n-tag--purple",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-indigo aria-pressed:bg-[var(--color-tag-indigo-bg)] aria-pressed:text-[var(--color-tag-indigo-text)]",
    ],
    [
      "n-tag--orange",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-orange aria-pressed:bg-[var(--color-tag-orange-bg)] aria-pressed:text-[var(--color-tag-orange-text)]",
    ],
    [
      "n-tag--amber",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-orange aria-pressed:bg-[var(--color-tag-orange-bg)] aria-pressed:text-[var(--color-tag-orange-text)]",
    ],
    [
      "n-tag--teal",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-green aria-pressed:bg-[var(--color-tag-green-bg)] aria-pressed:text-[var(--color-tag-green-text)]",
    ],
    [
      "n-tag--indigo",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-indigo aria-pressed:bg-[var(--color-tag-indigo-bg)] aria-pressed:text-[var(--color-tag-indigo-text)]",
    ],
    [
      "n-tag--rose",
      "border border-edge bg-surface-gray text-secondary transition-all aria-pressed:border-accent-pink aria-pressed:bg-[var(--color-tag-pink-bg)] aria-pressed:text-[var(--color-tag-pink-text)]",
    ],
    // Scenario card selected state
    [
      "n-scenario-card",
      "w-full text-left cursor-pointer aria-selected:border-accent-indigo aria-selected:bg-gradient-to-br aria-selected:from-surface-hover aria-selected:to-[rgba(99,102,241,0.05)] aria-selected:shadow-[0_0_0_1px_var(--color-accent-indigo),0_10px_15px_-3px_rgba(99,102,241,0.1)]",
    ],
    // Submit button
    [
      "n-btn-submit",
      "w-full border-none rounded-xl py-[0.875rem] px-6 text-base font-semibold text-white bg-gradient-to-br from-accent-indigo to-accent-blue cursor-pointer transition-all duration-200 shadow-[0_4px_12px_rgba(99,102,241,0.3)] [text-shadow:0_1px_2px_rgba(0,0,0,0.1)] hover:not-disabled:translate-y-[-1px] hover:not-disabled:shadow-[0_6px_16px_rgba(99,102,241,0.4)] active:not-disabled:translate-y-[1px] disabled:bg-surface-gray disabled:text-tertiary disabled:shadow-none disabled:cursor-not-allowed",
    ],
  ],
});
