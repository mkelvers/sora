import { Preferences } from "$lib/preferences";
import type { PlaybackMedia } from "@sora/sdk";
import { attempt } from "@sora/shared";
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

		const volume = preferences.get("volume");
		const speed = preferences.get("speed");
		this.volume = typeof volume === "number" && volume >= 0 && volume <= 1 ? volume : 1;
		this.muted = preferences.get("muted") === true;
		this.speed = typeof speed === "number" && speed > 0 ? speed : 1;
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
				k: toggle,
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

			const stop =
				source.format === "hls"
					? this.#hls(video, source.url, start)
					: this.#direct(video, source.url, start);

			return () => {
				this.#resume ??= video.currentTime || start;
				stop();
				video.removeAttribute("src");
				video.load();
			};
		};

	#direct(video: HTMLVideoElement, url: string, start: number) {
		video.src = url;
		video.currentTime = start;
		return () => {};
	}

	#hls(video: HTMLVideoElement, url: string, start: number) {
		let hls: Hls | undefined;
		let detached = false;

		void (async () => {
			const loaded = await attempt(import("hls.js"));
			if (detached) {
				return;
			}
			if (loaded.error || !loaded.data.default.isSupported()) {
				this.#direct(video, url, start);
				return;
			}

			const Hls = loaded.data.default;
			const memory = "deviceMemory" in navigator ? Number(navigator.deviceMemory) : 4;
			hls = new Hls({
				startPosition: start,
				maxBufferLength: 7200,
				maxMaxBufferLength: 7200,
				maxBufferSize: Math.min(memory * 250, 2000) * 1000 * 1000,
				backBufferLength: 60,
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
					this.#reloads++;
				}
			});
			hls.loadSource(url);
			hls.attachMedia(video);
		})();

		return () => {
			detached = true;
			hls?.destroy();
		};
	}

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
