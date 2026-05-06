<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    onclose: () => void;
    label: string;
    variant?: "center" | "bottom";
    children: Snippet;
  }

  let { onclose, label, variant = "center", children }: Props = $props();

  function handleOverlayClick() {
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<div
  class="modal-overlay"
  class:bottom={variant === "bottom"}
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="-1"
  aria-label="Close dialog"
>
  <div
    class="modal-content"
    class:modal-sheet={variant === "bottom"}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
    onclick={(e: MouseEvent) => e.stopPropagation()}
    onkeydown={(e: KeyboardEvent) => { if (e.key === "Escape") onclose(); }}
  >
    {@render children()}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(27, 28, 26, 0.35);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-overlay.bottom {
    align-items: flex-end;
  }

  .modal-content {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    max-width: 400px;
    width: 90%;
    box-shadow: var(--shadow-ambient);
    max-height: 85vh;
    overflow-y: auto;
    color: var(--color-text);
  }

  .modal-sheet {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    max-width: 440px;
    width: 100%;
    padding-bottom: calc(var(--spacing-xl) + env(safe-area-inset-bottom, 0px));
    background: var(--color-surface-lowest);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.2);
    animation: sheet-up 0.25s ease-out;
  }

  @keyframes sheet-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
</style>
