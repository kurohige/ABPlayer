/**
 * Svelte action: focus the element on mount.
 * Replacement for the `autofocus` attribute (which a11y lint rejects).
 *
 *   <input use:focusOnMount />
 */
export function focusOnMount(node: HTMLElement) {
  node.focus();
}
