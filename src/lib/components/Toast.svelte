<script lang="ts">
  import { toasts, dismissToast } from "../stores/toastStore";
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast" role="status">
        {#if toast.icon}
          <span class="material-symbols-outlined toast-icon">{toast.icon}</span>
        {/if}
        <span class="toast-text">{toast.text}</span>
        {#if toast.action}
          {@const action = toast.action}
          <button class="toast-action" onclick={() => { action.run(); dismissToast(toast.id); }}>
            {action.label}
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: var(--spacing-xl);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    z-index: 200;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface-lowest);
    color: var(--color-text);
    padding: 10px 18px;
    border-radius: var(--radius-xl);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 500;
    white-space: nowrap;
    animation: toast-in 0.25s ease-out;
  }

  .toast-icon {
    font-size: 18px;
    color: var(--color-primary);
    font-variation-settings: "FILL" 1;
  }

  .toast-text {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The container ignores the pointer so toasts never block the page; the one button opts back in */
  .toast-action {
    pointer-events: auto;
    margin-left: 0.3rem;
    padding: 0.2rem 0.6rem;
    background: none;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-xl);
    color: var(--color-primary);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .toast-action:hover {
    background: var(--color-surface-high);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
