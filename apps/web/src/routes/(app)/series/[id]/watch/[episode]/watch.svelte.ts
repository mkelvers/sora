import { browser } from "$app/env";
import { Preferences } from "$lib/preferences";
import type { PlaybackMedia } from "@sora/sdk";
import { attempt } from "@sora/shared";
import type Hls from "hls.js";
import type { Level } from "hls.js";
import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

type Source = PlaybackMedia["sources"][number];

interface Range {
	start: number;
	end: number;
}

interface Quality {
	height: number;
	level: number;
}

const preferences = new Preferences("player");

const forwardBufferSeconds = 120;
const backBufferSeconds = 30;
const megabyte = 1000 * 1000;
const bufferMegabytesPerGigabyte = 25;
const maximumBufferMegabytes = 200;
const firstByteTimeoutMs = 30_000;
const startBandwidthBitsPerSecond = 10_000_000;

const loadHls = () => attempt(import("hls.js"));

if (browser) {
	loadHls();
}

const subscribeFullscreen = createSubscriber((update) => {
	on(document, "fullscreenchange", update);
});

const qualitiesOf = (levels: Level[]) => {
	const best = new Map<number, number>();
	for (const [index, level] of levels.entries()) {
		if (level.height > 0) {
			best.set(level.height, index);
		}
	}

	return [...best]
		.map(([height, level]): Quality => ({
			height,
			level,
		}))
		.toSorted((left, right) => right.height - left.height);
};

const playDirect = (video: HTMLVideoElement, url: string, start: number) => {
	video.src = url;
	video.currentTime = start;
};

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
	qualities = $state<Quality[]>([]);
	quality = $state<number | null>(null);

	chosen = $derived.by(() => {
		const { quality } = this;
		if (quality === null) {
			return;
		}

		return this.qualities.find((candidate) => candidate.height <= quality) ?? this.qualities.at(-1);
	});

	played = $derived(this.duration > 0 ? this.time / this.duration : 0);
	loaded = $derived.by(() => {
		const range = this.buffered.find((span) => span.start <= this.time && this.time <= span.end);

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
	#instance: Hls | undefined;

	constructor(start: number, quality: number | null) {
		this.time = start;
		this.#resume = start;

		const volume = preferences.get("volume");
		const speed = preferences.get("speed");
		this.volume = typeof volume === "number" && volume >= 0 && volume <= 1 ? volume : 1;
		this.muted = preferences.get("muted") === true;
		this.speed = typeof speed === "number" && speed > 0 ? speed : 1;
		this.quality = quality;
	}

	remember = () => {
		preferences.set("volume", this.volume);
		preferences.set("muted", this.muted);
		preferences.set("speed", this.speed);
	};

	setQuality = (height: number | null) => {
		if (height === this.quality) {
			return;
		}

		this.quality = height;
		if (this.#instance) {
			this.#instance.nextLevel = this.chosen?.level ?? -1;
		}
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
		const target = event.target instanceof Element ? event.target : null;
		if (
			!target ||
			!this.root?.contains(target) ||
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			target.closest("input, textarea, [contenteditable]") ||
			(event.key === " " && target.closest("button, a"))
		) {
			return;
		}

		const toggle = () => (this.paused = !this.paused);
		const action =
			{
				" ": toggle,
				ArrowDown: () => this.nudgeVolume(-0.1),
				ArrowLeft: () => (this.time -= 10),
				ArrowRight: () => (this.time += 10),
				ArrowUp: () => this.nudgeVolume(0.1),
				f: this.toggleFullscreen,
				j: () => (this.time -= 10),
				k: toggle,
				l: () => (this.time += 10),
				m: () => (this.muted = !this.muted),
			}[event.key] ??
			(/^[0-9]$/u.test(event.key) ? () => this.seekTo(Number(event.key) / 10) : undefined);

		if (action) {
			event.preventDefault();
			action();
			this.wake();
		}
	};

	playback: Attachment<HTMLVideoElement> = (video) => {
		if (this.paused === video.paused) {
			return;
		}
		if (this.paused) {
			video.pause();
			return;
		}

		void this.#play(video);
	};

	async #play(video: HTMLVideoElement) {
		const { error } = await attempt(video.play(), DOMException);
		if (error && error.name !== "AbortError") {
			this.paused = true;
		}
	}

	stream =
		(source: Source | undefined): Attachment<HTMLVideoElement> =>
		(video) => {
			void this.#reloads;
			if (!source) {
				return;
			}

			const start = this.#resume ?? 0;
			this.#resume = undefined;

			let stop: (() => void) | undefined;
			if (source.format === "hls") {
				stop = this.#hls(video, source.url, start);
			} else {
				playDirect(video, source.url, start);
			}

			return () => {
				this.#resume ??= video.currentTime || start;
				stop?.();
				video.removeAttribute("src");
				video.load();
			};
		};

	#hls(video: HTMLVideoElement, url: string, start: number) {
		let hls: Hls | undefined;
		let detached = false;

		void (async () => {
			const loaded = await loadHls();
			if (detached) {
				return;
			}
			if (loaded.error || !loaded.data.default.isSupported()) {
				playDirect(video, url, start);
				return;
			}

			const Hls = loaded.data.default;
			const memory = "deviceMemory" in navigator ? Number(navigator.deviceMemory) : 4;
			hls = new Hls({
				abrEwmaDefaultEstimate: startBandwidthBitsPerSecond,
				backBufferLength: backBufferSeconds,
				fragLoadPolicy: {
					default: {
						errorRetry: {
							maxNumRetry: 6,
							maxRetryDelayMs: 4000,
							retryDelayMs: 500,
						},
						maxLoadTimeMs: 120_000,
						maxTimeToFirstByteMs: firstByteTimeoutMs,
						timeoutRetry: {
							maxNumRetry: 4,
							maxRetryDelayMs: 0,
							retryDelayMs: 0,
						},
					},
				},
				maxBufferLength: forwardBufferSeconds,
				maxBufferSize:
					Math.min(memory * bufferMegabytesPerGigabyte, maximumBufferMegabytes) * megabyte,
				maxMaxBufferLength: forwardBufferSeconds,
				startPosition: start,
			});
			this.#instance = hls;

			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				const levels = hls?.levels ?? [];
				this.qualities = qualitiesOf(levels);
				if (hls && this.chosen) {
					hls.nextLevel = this.chosen.level;
				}
			});

			let recovered = 0;
			hls.on(Hls.Events.ERROR, (_, data) => {
				if (!data.fatal) {
					return;
				}
				if (data.type === Hls.ErrorTypes.MEDIA_ERROR && performance.now() - recovered > 5000) {
					recovered = performance.now();
					hls?.recoverMediaError();
				} else if (performance.now() - this.#reloaded > 30_000) {
					this.#reloaded = performance.now();
					this.#reloads += 1;
				}
			});
			hls.loadSource(url);
			hls.attachMedia(video);
		})();

		return () => {
			detached = true;
			hls?.destroy();
			this.#instance = undefined;
			this.qualities = [];
		};
	}

	caption =
		(shown: boolean): Attachment<HTMLTrackElement> =>
		(element) => {
			const { track } = element;
			if (!shown) {
				track.mode = "disabled";
				return;
			}

			track.mode = "hidden";
			const update = () => {
				this.cues = [...(track.activeCues ?? [])] as VTTCue[];
			};
			track.addEventListener("cuechange", update);

			return () => {
				track.removeEventListener("cuechange", update);
				this.cues = [];
			};
		};
}
