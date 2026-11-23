import { browser } from "$app/env";
import { goto } from "$app/navigation";
import { Preferences } from "$lib/preferences";
import type { PlaybackMedia } from "@sora/sdk";
import { attempt } from "@sora/shared";
import type Hls from "hls.js";
import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";
import { z } from "zod";

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

if (browser) {
	attempt(import("hls.js"));
}

export class Player {
	static readonly #fullscreen = createSubscriber((update) => {
		on(document, "fullscreenchange", update);
	});

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

	played = $derived.by(() => {
		if (this.duration > 0) {
			return this.time / this.duration;
		}

		return 0;
	});
	loaded = $derived.by(() => {
		const range = this.buffered.find((span) => span.start <= this.time && this.time <= span.end);

		if (range && this.duration > 0) {
			return range.end / this.duration;
		}

		return 0;
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

	#episodes: () => {
		next?: string;
		previous?: string;
	};

	constructor(
		start: number,
		quality: number | null,
		episodes: () => {
			next?: string;
			previous?: string;
		},
	) {
		this.#episodes = episodes;
		this.time = start;
		this.#resume = start;

		this.volume = preferences.get("volume", z.number().min(0).max(1)) ?? 1;
		this.muted = preferences.get("muted", z.boolean()) ?? false;
		this.speed = preferences.get("speed", z.number().positive()) ?? 1;
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
		Player.#fullscreen();

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
		const { target } = event;

		const ignored =
			!(target instanceof Element) ||
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey;

		if (ignored) {
			return;
		}

		const inPlayer = target === document.body || this.root?.contains(target);

		const captured = target.closest(
			'textarea, [contenteditable], input:not([type="range"]), :popover-open',
		);

		const controlOwnsKey =
			target.matches(":focus-visible") &&
			(target.matches('input[type="range"]') || (event.key === " " && target.closest("button, a")));

		const foreign = !inPlayer || captured || controlOwnsKey;

		if (foreign) {
			return;
		}

		const toggle = () => (this.paused = !this.paused);
		const { next, previous } = this.#episodes();

		const actions = new Map<string, () => void>(
			Object.entries({
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
			}),
		);

		if (next) {
			actions.set("N", () => goto(next));
		}

		if (previous) {
			actions.set("P", () => goto(previous));
		}

		let action = actions.get(event.key);

		if (!action && /^[0-9]$/u.test(event.key)) {
			action = () => this.seekTo(Number(event.key) / 10);
		}

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
				video.src = source.url;
				video.currentTime = start;
			}

			return () => {
				this.#resume ??= video.currentTime || start;
				stop?.();
				video.removeAttribute("src");
				video.load();
			};
		};

	#hls(video: HTMLVideoElement, url: string, start: number) {
		const megabyte = 1000 * 1000;

		let hls: Hls | undefined;
		let detached = false;

		void (async () => {
			const loaded = await attempt(import("hls.js"));

			if (detached) {
				return;
			}

			if (loaded.error || !loaded.data.default.isSupported()) {
				video.src = url;
				video.currentTime = start;

				return;
			}

			const Hls = loaded.data.default;
			let memory = 4;

			if ("deviceMemory" in navigator) {
				memory = Number(navigator.deviceMemory);
			}

			hls = new Hls({
				abrEwmaDefaultEstimate: 10_000_000,
				backBufferLength: 30,
				fragLoadPolicy: {
					default: {
						errorRetry: {
							maxNumRetry: 6,
							maxRetryDelayMs: 4000,
							retryDelayMs: 500,
						},
						maxLoadTimeMs: 120_000,
						maxTimeToFirstByteMs: 30_000,
						timeoutRetry: {
							maxNumRetry: 4,
							maxRetryDelayMs: 0,
							retryDelayMs: 0,
						},
					},
				},
				maxBufferLength: forwardBufferSeconds,
				maxBufferSize: Math.min(memory * 25, 200) * megabyte,
				maxMaxBufferLength: forwardBufferSeconds,
				startPosition: start,
			});
			this.#instance = hls;

			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				const best = new Map<number, number>();

				for (const [index, level] of (hls?.levels ?? []).entries()) {
					if (level.height > 0) {
						best.set(level.height, index);
					}
				}

				this.qualities = [...best]
					.map(([height, level]): Quality => ({
						height,
						level,
					}))
					.toSorted((left, right) => right.height - left.height);

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
				this.cues = [...(track.activeCues ?? [])].filter(
					(cue): cue is VTTCue => cue instanceof VTTCue,
				);
			};

			track.addEventListener("cuechange", update);

			return () => {
				track.removeEventListener("cuechange", update);
				this.cues = [];
			};
		};
}
