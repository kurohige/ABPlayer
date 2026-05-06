<script lang="ts">
  interface Props {
    progress: number;
    barCount?: number;
    seed?: string;
    height?: number;
    onclick?: (e: MouseEvent) => void;
  }

  let { progress, barCount = 60, seed = "", height = 32, onclick }: Props = $props();

  function generateBars(s: string, count: number): number[] {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
      hash = (hash * 1103515245 + 12345) | 0;
      const val = ((hash >> 16) & 0x7fff) / 0x7fff;
      bars.push(0.15 + val * 0.85);
    }
    return bars;
  }

  let bars = $derived(generateBars(seed, barCount));
  let clipWidth = $derived((barCount * progress) / 100);
  let clipId = $derived(`wf-clip-${seed.length}-${barCount}`);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  viewBox="0 0 {barCount} {height}"
  class="waveform"
  preserveAspectRatio="none"
  style="height: {height}px;"
  onclick={onclick}
>
  <!-- Background bars -->
  {#each bars as h, i}
    <rect
      x={i + 0.2}
      y={(height - h * height) / 2}
      width={0.6}
      height={h * height}
      fill="var(--color-surface-highest)"
      rx="0.15"
    />
  {/each}

  <!-- Clipped progress bars -->
  <defs>
    <clipPath id={clipId}>
      <rect x="0" y="0" width={clipWidth} height={height} />
    </clipPath>
  </defs>
  <g clip-path="url(#{clipId})">
    {#each bars as h, i}
      <rect
        x={i + 0.2}
        y={(height - h * height) / 2}
        width={0.6}
        height={h * height}
        fill="var(--color-primary)"
        rx="0.15"
      />
    {/each}
  </g>
</svg>

<style>
  .waveform {
    width: 100%;
    cursor: pointer;
    display: block;
  }
</style>
