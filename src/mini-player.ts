import MiniPlayer from "./MiniPlayer.svelte";
import { mount } from "svelte";

const app = mount(MiniPlayer, {
  target: document.getElementById("mini-app")!,
});

export default app;
