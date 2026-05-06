<script lang="ts">
  import type { AppTheme, FontScale, FontFamily } from "../types";
  import { setPreference } from "../stores/userdataStore";
  import { THEME_PRESETS } from "../themes";
  import { open as shellOpen } from "@tauri-apps/plugin-shell";

  const APP_VERSION = "1.1.4";
  const CREATOR_NAME = "jhidalgo_dev";
  const COFFEE_URL = "https://buymeacoffee.com/jhidalgo_dev";

  function openExternal(url: string) {
    shellOpen(url);
  }

  interface Props {
    open: boolean;
    theme: AppTheme;
    colorTheme: string;
    fontScale: FontScale;
    fontFamily: FontFamily;
    onclose: () => void;
  }

  let { open, theme, colorTheme, fontScale, fontFamily, onclose }: Props = $props();

  const themes: { value: AppTheme; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "light_mode" },
    { value: "dark", label: "Dark", icon: "dark_mode" },
  ];

  const fontScales: { value: FontScale; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "default", label: "Default" },
    { value: "large", label: "Large" },
  ];

  const fontFamilies: { value: FontFamily; label: string; hint: string }[] = [
    { value: "editorial", label: "Editorial", hint: "Newsreader + Manrope" },
    { value: "modern", label: "Modern", hint: "Source Serif + Inter" },
  ];
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={onclose}></div>
  <aside class="panel">
    <div class="panel-header">
      <h2>Settings</h2>
      <button class="close-btn" onclick={onclose}>
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="section">
      <h3 class="section-label">Theme</h3>
      <div class="option-row">
        {#each themes as t}
          <button
            class="option-btn"
            class:active={theme === t.value}
            onclick={() => setPreference("theme", t.value)}
          >
            <span class="material-symbols-outlined" style="font-size:18px;">{t.icon}</span>
            {t.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Color</h3>
      <div class="color-row">
        {#each THEME_PRESETS as preset}
          <button
            class="color-swatch"
            class:active={colorTheme === preset.id}
            style:background={theme === "dark" ? preset.dark.primary : preset.light.primary}
            onclick={() => setPreference("colorTheme", preset.id)}
            title={preset.name}
          >
            {#if colorTheme === preset.id}
              <span class="material-symbols-outlined swatch-check" style="font-size:14px; font-variation-settings: 'FILL' 1;">check</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Font Size</h3>
      <div class="option-row">
        {#each fontScales as fs}
          <button
            class="option-btn"
            class:active={fontScale === fs.value}
            onclick={() => setPreference("fontScale", fs.value)}
          >
            {fs.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <h3 class="section-label">Font Family</h3>
      <div class="option-col">
        {#each fontFamilies as ff}
          <button
            class="family-btn"
            class:active={fontFamily === ff.value}
            onclick={() => setPreference("fontFamily", ff.value)}
          >
            <span class="family-label">{ff.label}</span>
            <span class="family-hint">{ff.hint}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="section about-section">
      <h3 class="section-label">About</h3>
      <div class="about-card">
        <div class="about-header">
          <span class="material-symbols-outlined about-icon">headphones</span>
          <div>
            <p class="about-name">ABPlayer</p>
            <p class="about-version">v{APP_VERSION}</p>
          </div>
        </div>
        <p class="about-desc">A modern desktop audiobook player with chapter navigation, position saving, and library management.</p>
        <div class="about-links">
          <p class="about-creator">
            <span class="material-symbols-outlined" style="font-size:14px;">person</span>
            Created by {CREATOR_NAME}
          </p>
          <button class="coffee-btn" onclick={() => openExternal(COFFEE_URL)}>
            <span class="material-symbols-outlined" style="font-size:16px;">coffee</span>
            Buy Me a Coffee
          </button>
        </div>
      </div>
    </div>
  </aside>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 90;
  }

  .panel {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 260px;
    max-width: 80vw;
    background: var(--color-surface);
    z-index: 91;
    padding: var(--spacing-lg) var(--spacing-md);
    overflow-y: auto;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-lg);
  }

  .panel-header h2 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-md);
  }

  .close-btn:hover {
    color: var(--color-text);
  }

  .close-btn .material-symbols-outlined {
    font-size: 20px;
  }

  .section {
    margin-bottom: var(--spacing-lg);
  }

  .section-label {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-sm);
  }

  .option-row {
    display: flex;
    gap: 4px;
  }

  .option-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .family-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.5rem 0.8rem;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    text-align: left;
  }

  .family-btn:hover { background: var(--color-surface-highest); }

  .family-btn.active {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .family-label {
    font-family: var(--font-headline);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .family-hint {
    font-family: var(--font-label);
    font-size: 0.6rem;
    letter-spacing: 0.05em;
    opacity: 0.75;
  }

  .option-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 7px 10px;
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .option-btn:hover {
    background: var(--color-surface-highest);
  }

  .option-btn.active {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .color-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, transform 0.15s;
  }

  .color-swatch:hover {
    transform: scale(1.1);
  }

  .color-swatch.active {
    border-color: var(--color-text);
  }

  .swatch-check {
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .about-section {
    margin-top: auto;
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-outline-variant);
  }

  .about-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .about-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .about-icon {
    font-size: 28px;
    color: var(--color-primary);
    font-variation-settings: "FILL" 1;
  }

  .about-name {
    font-family: var(--font-headline);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-text);
  }

  .about-version {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
  }

  .about-desc {
    font-family: var(--font-body);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
    line-height: 1.5;
  }

  .about-links {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .about-creator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .coffee-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 8px 14px;
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
    width: fit-content;
  }

  .coffee-btn:hover {
    background: var(--color-surface-highest);
    transform: translateY(-1px);
  }

  .coffee-btn:active {
    transform: translateY(0);
  }
</style>
