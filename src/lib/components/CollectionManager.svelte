<script lang="ts">
  import type { Collection } from "../types";
  import Modal from "./Modal.svelte";
  import {
    createCollection,
    deleteCollection,
    renameCollection,
  } from "../stores/userdataStore";

  interface Props {
    collections: Collection[];
    onclose: () => void;
  }

  let { collections, onclose }: Props = $props();

  let newName = $state("");
  let newColor = $state("#0d7377");
  let editingId = $state<string | null>(null);
  let editingName = $state("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    await createCollection(name, newColor);
    newName = "";
    newColor = "#0d7377";
  }

  async function handleDelete(id: string) {
    await deleteCollection(id);
  }

  function startEdit(col: Collection) {
    editingId = col.id;
    editingName = col.name;
  }

  async function saveEdit() {
    if (editingId && editingName.trim()) {
      await renameCollection(editingId, editingName.trim());
    }
    editingId = null;
  }
</script>

<Modal {onclose} label="Collections">
    <h3>Collections</h3>

    <div class="create-row">
      <input
        type="text"
        class="input"
        bind:value={newName}
        placeholder="New collection name"
        onkeydown={(e: KeyboardEvent) => e.key === "Enter" && handleCreate()}
      />
      <input type="color" class="color-picker" bind:value={newColor} />
      <button class="btn-sm" onclick={handleCreate}>Add</button>
    </div>

    {#if collections.length === 0}
      <p class="empty">No collections yet</p>
    {:else}
      <ul class="list">
        {#each collections as col (col.id)}
          <li class="list-item">
            <span class="dot" style:background={col.color}></span>
            {#if editingId === col.id}
              <input
                type="text"
                class="input inline-input"
                bind:value={editingName}
                onkeydown={(e: KeyboardEvent) => e.key === "Enter" && saveEdit()}
                onblur={saveEdit}
              />
            {:else}
              <span class="col-name" role="button" tabindex="0" ondblclick={() => startEdit(col)} onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") startEdit(col); }}>{col.name}</span>
            {/if}
            <button
              class="icon-btn"
              onclick={() => handleDelete(col.id)}
              title="Delete"
            >
              <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="dialog-footer">
      <button class="btn-ghost" onclick={onclose}>Done</button>
    </div>
</Modal>

<style>
  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: var(--spacing-md);
  }

  .create-row {
    display: flex;
    gap: 6px;
    margin-bottom: var(--spacing-md);
  }

  .input {
    flex: 1;
    padding: 6px 10px;
    border: none;
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    color: var(--color-text);
    outline: none;
  }

  .input:focus {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }

  .color-picker {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    padding: 0;
    background: none;
  }

  .btn-sm {
    background: var(--gradient-primary);
    color: var(--color-on-primary);
    border: none;
    padding: 6px 12px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .empty {
    text-align: center;
    color: var(--color-outline);
    font-size: var(--font-size-sm);
    padding: var(--spacing-md) 0;
  }

  .list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: var(--radius-md);
  }

  .list-item:hover {
    background: var(--color-surface);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .col-name {
    flex: 1;
    font-family: var(--font-body);
    font-size: var(--font-size-sm);
    cursor: default;
  }

  .inline-input {
    flex: 1;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--color-outline);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: opacity 0.1s;
  }

  .list-item:hover .icon-btn {
    opacity: 1;
  }

  .icon-btn:hover {
    color: var(--color-error);
  }

  .dialog-footer {
    margin-top: var(--spacing-md);
    text-align: right;
  }

  .btn-ghost {
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    padding: 6px 16px;
    border-radius: var(--radius-xl);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ghost:hover {
    background: var(--color-surface-highest);
  }
</style>
