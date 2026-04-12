<script lang="ts">
  import type { AppTheme } from "../types";

  interface Props {
    theme: AppTheme;
    ontoggle: () => void;
  }

  let { theme, ontoggle }: Props = $props();
</script>

<button class="theme-toggle" onclick={ontoggle} title="Toggle theme">
  <span class="material-symbols-outlined">
    {theme === "dark" ? "light_mode" : "dark_mode"}
  </span>
</button>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-variant);
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    transition: color 0.15s, background 0.15s;
  }

  .theme-toggle:hover {
    color: var(--color-primary);
    background: var(--color-surface-high);
  }

  .theme-toggle .material-symbols-outlined {
    font-size: 20px;
  }
</style>
