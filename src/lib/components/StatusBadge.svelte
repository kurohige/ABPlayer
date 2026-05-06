<script lang="ts">
  import type { BookStatus } from "../types";

  interface Props {
    status: BookStatus;
    size?: "sm" | "md";
  }

  let { status, size = "sm" }: Props = $props();

  const config: Record<BookStatus, { label: string; color: string }> = {
    not_started: { label: "New", color: "var(--color-outline)" },
    in_progress: { label: "Reading", color: "var(--color-primary-container)" },
    finished: { label: "Done", color: "var(--color-secondary)" },
  };

  let current = $derived(config[status]);
</script>

{#if status !== "not_started"}
  <span class="badge" class:md={size === "md"} style:--badge-color={current.color}>
    {current.label}
  </span>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-label);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-surface-lowest);
    background: var(--badge-color);
    padding: 2px 6px;
    border-radius: var(--radius-xl);
    line-height: 1;
    white-space: nowrap;
  }

  .badge.md {
    font-size: var(--font-size-xs);
    padding: 3px 8px;
  }
</style>
