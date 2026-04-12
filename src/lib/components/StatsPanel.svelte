<script lang="ts">
  import { statisticsStore, getWeeklyTotal, getDailyAverage, getGenreBreakdown } from "../stores/statisticsStore";
  import { userdataStore } from "../stores/userdataStore";
  import Modal from "./Modal.svelte";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  function formatDuration(secs: number): string {
    if (!secs || !isFinite(secs) || secs < 0) return "0m";
    if (secs < 3600) return `${Math.round(secs / 60)}m`;
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      const rh = h % 24;
      return `${d}d ${rh}h`;
    }
    return `${h}h ${m}m`;
  }

  let weeklyTotal = $derived(getWeeklyTotal($statisticsStore));
  let dailyAvg = $derived(getDailyAverage($statisticsStore));
  let genreData = $derived(getGenreBreakdown($statisticsStore, $userdataStore.books));
  let maxGenreSecs = $derived(genreData.length > 0 ? genreData[0].totalSecs : 1);

  let firstSession = $derived(
    $statisticsStore.sessionsLog.length > 0
      ? $statisticsStore.sessionsLog[0].startedAt
      : null,
  );
  let daysSinceFirst = $derived(
    firstSession
      ? Math.max(1, Math.round((Date.now() - new Date(firstSession).getTime()) / (1000 * 60 * 60 * 24)))
      : 1,
  );
  let pace = $derived(
    $statisticsStore.booksFinishedCount > 0
      ? ($statisticsStore.booksFinishedCount / daysSinceFirst * 30).toFixed(1)
      : "0",
  );
</script>

<Modal {onclose} label="Listening Statistics">
    <h3>Listening Statistics</h3>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{formatDuration($statisticsStore.totalListeningTimeSecs)}</span>
        <span class="stat-label">Total Listening</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{$statisticsStore.booksFinishedCount}</span>
        <span class="stat-label">Books Finished</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{$statisticsStore.currentStreakDays}d</span>
        <span class="stat-label">Current Streak</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{$statisticsStore.longestStreakDays}d</span>
        <span class="stat-label">Longest Streak</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{formatDuration(dailyAvg)}</span>
        <span class="stat-label">Daily Average</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{formatDuration(weeklyTotal)}</span>
        <span class="stat-label">This Week</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{pace}</span>
        <span class="stat-label">Books / Month</span>
      </div>
      {#if $statisticsStore.booksFinishedCount > 0}
        <div class="stat-card">
          <span class="stat-value">{formatDuration($statisticsStore.totalListeningTimeSecs / $statisticsStore.booksFinishedCount)}</span>
          <span class="stat-label">Avg per Book</span>
        </div>
      {/if}
    </div>

    {#if genreData.length > 0}
      <h4>Genre Breakdown</h4>
      <div class="genre-list">
        {#each genreData as g}
          <div class="genre-row">
            <span class="genre-name">{g.genre}</span>
            <div class="genre-bar-bg">
              <div
                class="genre-bar-fill"
                style:width="{(g.totalSecs / maxGenreSecs) * 100}%"
              ></div>
            </div>
            <span class="genre-time">{formatDuration(g.totalSecs)}</span>
          </div>
        {/each}
      </div>
    {/if}

    <button class="close-btn" onclick={onclose}>Close</button>
</Modal>

<style>
  h3 {
    font-family: var(--font-headline);
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin-bottom: var(--spacing-md);
  }

  h4 {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-variant);
    margin-top: var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .stat-card {
    background: var(--color-surface-high);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-family: var(--font-headline);
    font-size: var(--font-size-xl);
    font-weight: 500;
    color: var(--color-primary);
  }

  .stat-label {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-text-variant);
  }

  .genre-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .genre-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .genre-name {
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    color: var(--color-text);
    min-width: 70px;
    flex-shrink: 0;
  }

  .genre-bar-bg {
    flex: 1;
    height: 6px;
    background: var(--color-surface-highest);
    border-radius: 3px;
    overflow: hidden;
  }

  .genre-bar-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
    transition: width 0.3s;
  }

  .genre-time {
    font-family: var(--font-label);
    font-size: var(--font-size-xs);
    color: var(--color-outline);
    min-width: 40px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .close-btn {
    display: block;
    margin: var(--spacing-lg) auto 0;
    background: var(--color-surface-high);
    border: none;
    color: var(--color-text-variant);
    font-family: var(--font-label);
    font-size: var(--font-size-sm);
    font-weight: 600;
    padding: 8px 20px;
    border-radius: var(--radius-xl);
    cursor: pointer;
  }

  .close-btn:hover {
    background: var(--color-surface-highest);
  }
</style>
