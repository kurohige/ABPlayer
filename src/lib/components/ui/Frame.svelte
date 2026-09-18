<script lang="ts">
  /**
   * The one card/panel/well surface: hairline edge, radius 10, surface fill,
   * no shadow. Everything that used to invent its own border + shadow uses it.
   */
  import type { Snippet } from "svelte";

  interface Props {
    /** Padding in rem; the handoff's 16px card / 14px panel are 1.1 / 1rem. */
    pad?: string;
    /** "dashed" is the unranked pool and the drop placeholders. */
    variant?: "solid" | "dashed";
    /** Applied to the wrapper so callers can lay it out. */
    class?: string;
    style?: string;
    children: Snippet;
  }

  let { pad = "1.1rem", variant = "solid", class: klass = "", style = "", children }: Props =
    $props();
</script>

<div class="ab-frame {klass}" class:dashed={variant === "dashed"} style="--pad: {pad}; {style}">
  {@render children()}
</div>

<style>
  .ab-frame {
    padding: var(--pad);
    background: var(--color-surface);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    min-width: 0;
  }

  .ab-frame.dashed {
    background: none;
    border-style: dashed;
  }
</style>
