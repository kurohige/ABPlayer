<script lang="ts">
  /**
   * The `?` sheet (handoff backlog #6). Every shortcut registered in
   * App.svelte appears here — if you add one there, add its row here too.
   */
  import Modal from "./Modal.svelte";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
    {
      title: "Playback",
      items: [
        { keys: ["Space"], label: "Play or pause" },
        { keys: ["←"], label: "Back 30 seconds" },
        { keys: ["→"], label: "Forward 30 seconds" },
        { keys: ["↑"], label: "Volume up" },
        { keys: ["↓"], label: "Volume down" },
        { keys: ["M"], label: "Mute or unmute" },
      ],
    },
    {
      title: "Navigation",
      items: [
        { keys: ["Esc"], label: "Back to the library" },
        { keys: ["Ctrl", "F"], label: "Search the library" },
        { keys: ["?"], label: "This list" },
      ],
    },
    {
      title: "System wide",
      items: [
        { keys: ["Ctrl", "Shift", "P"], label: "Play or pause, even when ABPlayer is not focused" },
        { keys: ["Ctrl", "Shift", "M"], label: "Open or close the mini player" },
      ],
    },
  ];
</script>

<Modal {onclose} label="Keyboard shortcuts">
  <h2 class="ks-title">Keyboard shortcuts</h2>
  <div class="ks-groups">
    {#each GROUPS as group (group.title)}
      <section class="ks-group">
        <h3 class="ks-group-title">{group.title}</h3>
        <dl class="ks-list">
          {#each group.items as item (item.label)}
            <div class="ks-row">
              <dt class="ks-keys">
                {#each item.keys as key, i (key)}
                  {#if i > 0}<span class="ks-plus">+</span>{/if}
                  <kbd class="ks-key">{key}</kbd>
                {/each}
              </dt>
              <dd class="ks-label">{item.label}</dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</Modal>

<style>
  .ks-title {
    margin: 0 0 0.97rem;
    font-family: var(--font-headline);
    font-weight: 500;
    font-size: 1.46rem;
    line-height: 1;
  }

  .ks-groups {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .ks-group-title {
    margin: 0 0 0.42rem;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.66rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-outline);
  }

  .ks-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }

  .ks-row {
    display: flex;
    align-items: baseline;
    gap: 0.83rem;
  }

  .ks-keys {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    width: 8.3rem;
    flex-shrink: 0;
  }

  .ks-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6rem;
    padding: 0.14rem 0.35rem;
    background: var(--color-surface-high);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.69rem;
    color: var(--color-text);
  }

  .ks-plus {
    font-family: var(--font-label);
    font-size: 0.66rem;
    color: var(--color-outline);
  }

  .ks-label {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-text-variant);
  }
</style>
