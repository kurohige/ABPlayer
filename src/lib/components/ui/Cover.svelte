<script lang="ts">
  /**
   * Square cover with the hairline + surface-high fallback, the `auto_stories`
   * placeholder, and an optional progress bar pinned to its bottom edge.
   *
   * One badge per cover (handoff backlog #5): pass exactly one of `logged`,
   * `progress` or `tier` — the component enforces the priority if more arrive.
   */
  interface Props {
    src?: string | null;
    alt?: string;
    /** Side length in rem: 228/132/108/72/52/38/34px → 15.8/9.2/7.5/5/3.6/2.6/2.4rem. */
    size?: string;
    /** 0–100. Rendered as the 3px bottom bar. */
    progress?: number | null;
    /** Metadata-only book: shows the LOGGED chip and suppresses the rest. */
    logged?: boolean;
    /** Tier label + color; shown only when there is no progress bar. */
    tier?: { label: string; color: string } | null;
    class?: string;
  }

  let {
    src = null,
    alt = "",
    size = "7.5rem",
    progress = null,
    logged = false,
    tier = null,
    class: klass = "",
  }: Props = $props();

  // Exactly one marker, in this order: logged > progress > tier > none.
  let showLogged = $derived(logged);
  let showProgress = $derived(!logged && progress !== null && progress > 0 && progress < 100);
  let showTier = $derived(!logged && !showProgress && tier !== null);
</script>

<div class="ab-cover {klass}" style="--size: {size};">
  {#if src}
    <img {src} {alt} />
  {:else}
    <span class="material-symbols-outlined ab-cover-ph" aria-hidden="true">auto_stories</span>
  {/if}

  {#if showLogged}
    <span class="ab-cover-logged">LOGGED</span>
  {:else if showTier && tier}
    <span class="ab-cover-tier" style="--tier-color: {tier.color};">{tier.label}</span>
  {/if}

  {#if showProgress}
    <span class="ab-cover-track">
      <span class="ab-cover-fill" style="width: {Math.min(100, Math.max(0, progress ?? 0))}%;"
      ></span>
    </span>
  {/if}
</div>

<style>
  .ab-cover {
    position: relative;
    width: var(--size);
    height: var(--size);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--color-surface-high);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-md);
  }

  .ab-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .ab-cover-ph {
    font-size: calc(var(--size) * 0.45);
    color: var(--color-outline-variant);
  }

  .ab-cover-track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--color-outline-variant);
  }

  .ab-cover-fill {
    display: block;
    height: 100%;
    background: var(--color-primary);
    transition: width var(--motion-progress) ease-out;
  }

  .ab-cover-logged {
    position: absolute;
    left: 0.28rem;
    top: 0.28rem;
    padding: 0.12rem 0.3rem;
    border-radius: var(--radius-sm);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.55rem;
    letter-spacing: 0.14em;
    line-height: 1;
  }

  .ab-cover-tier {
    position: absolute;
    left: 0.28rem;
    top: 0.28rem;
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 0.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--tier-color);
    color: #16110f;
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 0.6rem;
    line-height: 1;
  }
</style>
