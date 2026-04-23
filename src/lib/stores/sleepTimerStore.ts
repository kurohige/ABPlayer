import { get } from "svelte/store";
import { audioStore, getAudioElement } from "./audioStore";

let sleepInterval: ReturnType<typeof setInterval> | null = null;
let sleepChapterAtStart = -1;

export function setSleepTimer(minutes: number): void {
  cancelSleepTimer();
  const remaining = minutes * 60;
  audioStore.update((s) => ({
    ...s,
    sleepTimerRemaining: remaining,
    sleepTimerMode: "minutes",
  }));
  sleepInterval = setInterval(() => {
    audioStore.update((s) => {
      if (s.sleepTimerRemaining === null || s.sleepTimerRemaining <= 0) {
        return s;
      }
      const next = s.sleepTimerRemaining - 1;
      if (next <= 0) {
        getAudioElement().pause();
        clearInterval(sleepInterval!);
        sleepInterval = null;
        return { ...s, sleepTimerRemaining: null, sleepTimerMode: "off" as const };
      }
      return { ...s, sleepTimerRemaining: next };
    });
  }, 1000);
}

export function setSleepEndOfChapter(): void {
  cancelSleepTimer();
  sleepChapterAtStart = get(audioStore).currentChapterIndex;
  audioStore.update((s) => ({
    ...s,
    sleepTimerRemaining: null,
    sleepTimerMode: "end-of-chapter",
  }));
  sleepInterval = setInterval(() => {
    const state = get(audioStore);
    if (state.sleepTimerMode !== "end-of-chapter") return;
    if (state.currentChapterIndex !== sleepChapterAtStart && sleepChapterAtStart !== -1) {
      getAudioElement().pause();
      cancelSleepTimer();
    }
  }, 500);
}

export function cancelSleepTimer(): void {
  if (sleepInterval) {
    clearInterval(sleepInterval);
    sleepInterval = null;
  }
  audioStore.update((s) => ({
    ...s,
    sleepTimerRemaining: null,
    sleepTimerMode: "off",
  }));
}
