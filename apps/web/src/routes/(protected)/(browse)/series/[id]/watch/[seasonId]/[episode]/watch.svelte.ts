import { Preferences } from "$lib/preferences";
import type { PlaybackMedia } from "@sora/sdk";
import type Hls from "hls.js";
import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

type Source = PlaybackMedia["sources"][number];

type Range = {
	start: number;
	end: number;
};

const preferences = new Preferences("player");

const subscribeFullscreen = createSubscriber((update) => {
	on(document, "fullscreenchange", update);
});

export class Player {
	root?: HTMLElement;
	paused = $state(false);
	time = $state(0);
	duration = $state(0);
	buffered = $state<Range[]>([]);
	volume = $state(1);
	muted = $state(false);
	speed = $state(1);
	readyState = $state(0);
	idle = $state(false);
	cues = $state<VTTCue[]>([]);

	played = $derived(this.duration > 0 ? this.time / this.duration : 0);
	loaded = $derived.by(() => {
		const range = this.buffered.find((range) => {
			return range.start <= this.time && this.time <= range.end;
		});

		return range && this.duration > 0 ? range.end / this.duration : 0;
	});
	buffering = $derived(
		this.readyState < 3 &&
			!this.paused &&
			!this.buffered.some((range) => range.start <= this.time && this.time + 0.5 < range.end),
	);

	#timer: ReturnType<typeof setTimeout> | undefined;
	#dismissing = false;
	#resume: number | undefined;
	#reloads = $state(0);
	#reloaded = -Infinity;

	constructor(start: number) {
		this.time = start;
		this.#resume = start;

		this.volume = preferences.get(
			"volume",
			(value): value is number => typeof value === "number" && value >= 0 && value <= 1,
			1,
		);
		this.muted = preferences.get(
			"muted",
			(value): value is boolean => typeof value === "boolean",
			false,
		);
		this.speed = preferences.get(
			"speed",
			(value): value is number => typeof value === "number" && value > 0,
			1,
		);
	}

	remember = () => {
		preferences.set("volume", this.volume);
		preferences.set("muted", this.muted);
		preferences.set("speed", this.speed);
	};

	get fullscreen() {
		subscribeFullscreen();
		return this.root !== undefined && document.fullscreenElement === this.root;
	}

	load = (start: number) => {
		this.#resume = start;
		this.paused = false;
		this.duration = 0;
		this.cues = [];
	};

	wake = () => {
		this.idle = false;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.idle = true), 3000);
	};

	toggleFullscreen = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			this.root?.requestFullscreen();
		}
	};

	nudgeVolume = (step: number) => {
		this.volume = Math.round(Math.min(Math.max(this.volume + step, 0), 1) * 100) / 100;
		this.muted = this.volume === 0;
	};

	seekTo = (fraction: number) => {
		if (this.duration > 0) {
			this.time = this.duration * fraction;
		}
	};

	onpointerdown = () => {
		this.#dismissing = document.querySelector(":popover-open") !== null;
	};

	onclick = () => {
		if (!this.#dismissing) {
			this.paused = !this.paused;
		}
	};

	onkeydown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}
		if (
			event.target instanceof Element &&
			event.target.closest("input, textarea, [contenteditable]")
		) {
			return;
		}
		if (event.key === " " && event.target instanceof Element && event.target.closest("button, a")) {
			return;
		}

		const action =
			{
				" ": () => (this.paused = !this.paused),
				k: () => (this.paused = !this.paused),
				ArrowLeft: () => (this.time -= 10),
				ArrowRight: () => (this.time += 10),
				j: () => (this.time -= 10),
				l: () => (this.time += 10),
				ArrowUp: () => this.nudgeVolume(0.1),
				ArrowDown: () => this.nudgeVolume(-0.1),
				m: () => (this.muted = !this.muted),
				f: this.toggleFullscreen,
			}[event.key] ??
			(/^[0-9]$/.test(event.key) ? () => this.seekTo(Number(event.key) / 10) : undefined);

		if (action) {
			event.preventDefault();
			action();
			this.wake();
		}
	};

	stream =
		(source: Source | undefined): Attachment<HTMLVideoElement> =>
		(video) => {
			void this.#reloads;
			if (!source) {
				return;
			}

			const start = this.#resume ?? 0;
			this.#resume = undefined;

			let hls: Hls | undefined;
			let detached = false;

			const direct = () => {
				video.src = source.url;
				video.currentTime = start;
			};

			if (source.format === "hls") {
				import("hls.js")
					.then(({ default: Hls }) => {
						if (detached) {
							return;
						}
						if (!Hls.isSupported()) {
							direct();
							return;
						}

						const memory = "deviceMemory" in navigator ? Number(navigator.deviceMemory) : 4;
						const instance = new Hls({
							startPosition: start,
							maxBufferLength: 7200,
							maxMaxBufferLength: 7200,
							maxBufferSize: Math.min(memory * 250, 2000) * 1000 * 1000,
							backBufferLength: 60,
						});
						let recovered = 0;

						instance.on(Hls.Events.ERROR, (_, data) => {
							if (!data.fatal) {
								return;
							}
							if (
								data.type === Hls.ErrorTypes.MEDIA_ERROR &&
								performance.now() - recovered > 5000
							) {
								recovered = performance.now();
								instance.recoverMediaError();
								return;
							}
							if (performance.now() - this.#reloaded > 30_000) {
								this.#reloaded = performance.now();
								this.#reloads++;
							}
						});
						instance.loadSource(source.url);
						instance.attachMedia(video);
						hls = instance;
					})
					.catch(() => {
						if (!detached) {
							direct();
						}
					});
			} else {
				direct();
			}

			return () => {
				this.#resume ??= video.currentTime || start;
				detached = true;
				hls?.destroy();
				video.removeAttribute("src");
				video.load();
			};
		};

	caption =
		(shown: boolean): Attachment<HTMLTrackElement> =>
		(element) => {
			const track = element.track;
			if (!shown) {
				track.mode = "disabled";
				return;
			}

			track.mode = "hidden";
			track.oncuechange = () => {
				this.cues = [...(track.activeCues ?? [])] as VTTCue[];
			};

			return () => {
				track.oncuechange = null;
				this.cues = [];
			};
		};
}
