<script lang="ts">
  import { resumePrompt } from "../stores/positionStore";
  import { formatTime } from "../utils/format";
  import Modal from "./Modal.svelte";
</script>

{#if $resumePrompt.visible}
  <Modal onclose={$resumePrompt.onRestart} label="Resume Playback">
      <span class="dialog-icon material-symbols-outlined">bookmark</span>
      <h3>Resume Playback</h3>
      <p>
        {#if $resumePrompt.trackIndex > 0}
          Track {$resumePrompt.trackIndex + 1} at <strong>{formatTime($resumePrompt.position)}</strong>
        {:else}
          You were at <strong>{formatTime($resumePrompt.position)}</strong>
        {/if}
      </p>
      <div class="dialog-actions">
        <button class="btn btn-primary" onclick={$resumePrompt.onResume}>
          Resume
        </button>
        <button class="btn btn-ghost" onclick={$resumePrompt.onRestart}>
          Start Over
        </button>
      </div>
  </Modal>
{/if}

<style>
  .dialog-icon {
    font-size: 36px;
    color: var(--color-primary-container);
    margin-bottom: var(--spacing-sm);
    font-variation-settings: "FILL" 1;
  }

  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: var(--spacing-sm);
    color: var(--color-text);
  }

  p {
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    color: var(--color-text-variant);
    margin-bottom: var(--spacing-lg);
  }

  p strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .dialog-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: center;
  }

  .btn {
    padding: 8px 20px;
    border: none;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: var(--color-on-primary);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-ghost {
    background: var(--color-surface-high);
    color: var(--color-text-variant);
  }

  .btn-ghost:hover {
    background: var(--color-surface-highest);
  }
</style>
