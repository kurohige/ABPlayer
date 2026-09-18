<script lang="ts">
  /**
   * Three accent bars bouncing out of phase (handoff motion #8). Marks the
   * playing book and the active chapter row. This is one of the few places the
   * accent colour is allowed. Static under reduced motion.
   */
  interface Props {
    /** Bar height in rem; the handoff uses 9px in the continue card. */
    height?: string;
    label?: string;
    class?: string;
  }

  let { height = "0.62rem", label = "Playing", class: klass = "" }: Props = $props();
</script>

<span class="ab-eq {klass}" style="--h: {height};" role="img" aria-label={label}>
  <span class="ab-eq-bar"></span>
  <span class="ab-eq-bar"></span>
  <span class="ab-eq-bar"></span>
</span>

<style>
  .ab-eq {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: var(--h);
    flex-shrink: 0;
  }

  .ab-eq-bar {
    width: 2px;
    height: 100%;
    background: var(--color-primary);
    border-radius: 1px;
    transform-origin: bottom;
    animation: ab-eq var(--motion-eq) ease-in-out infinite;
  }

  .ab-eq-bar:nth-child(2) {
    animation-delay: 150ms;
  }

  .ab-eq-bar:nth-child(3) {
    animation-delay: 300ms;
  }
</style>
