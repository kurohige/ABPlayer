<script lang="ts">
  import { toasts } from "../stores/toastStore";
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast">
        {#if toast.icon}
          <span class="material-symbols-outlined toast-icon">{toast.icon}</span>
        {/if}
        <span class="toast-text">{toast.text}</span>
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
