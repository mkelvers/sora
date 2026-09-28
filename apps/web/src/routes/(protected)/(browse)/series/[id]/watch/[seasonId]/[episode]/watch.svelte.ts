import type { PlaybackMedia } from "@sora/sdk";
import type Hls from "hls.js";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

type Source = PlaybackMedia["sources"][number];

type Range = {
	start: number;
	end: number;
};

const subscribeFullscreen = createSubscriber((update) => {
	on(document, "fullscreenchange", update);
});

export class Player {
	root?: HTMLElement;
	paused = $state(true);
	time = $state(0);
	duration = $state(0);
	buffered = $state<Range[]>([]);
	volume = $state(1);
	muted = $state(false);
	speed = $state(1);
	readyState = $state(0);
	failure = $state<string>();
	idle = $state(false);
	cues = $state<VTTCue[]>([]);

	played = $derived(this.duration > 0 ? this.time / this.duration : 0);
	loaded = $derived.by(() => {
		const range = this.buffered.find((range) => {
			return range.start <= this.time && this.time <= range.end;
		});

		return range && this.duration > 0 ? range.end / this.duration : 0;
	});
	buffering = $derived(this.readyState < 3 && !this.paused);

	#timer: ReturnType<typeof setTimeout> | undefined;
	#dismissing = false;
	#resume: number | undefined;

	constructor(start: number) {
		this.time = start;
		this.#resume = start;
	}

	get fullscreen() {
		subscribeFullscreen();
		return this.root !== undefined && document.fullscreenElement === this.root;
	}

	load = (start: number) => {
		this.#resume = start;
		this.duration = 0;
		this.failure = undefined;
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

		const action = {
			" ": () => (this.paused = !this.paused),
			k: () => (this.paused = !this.paused),
			ArrowLeft: () => (this.time -= 10),
			ArrowRight: () => (this.time += 10),
			m: () => (this.muted = !this.muted),
			f: this.toggleFullscreen,
		}[event.key];

		if (action) {
			event.preventDefault();
			action();
			this.wake();
		}
	};

	stream =
		(source: Source | undefined): Attachment<HTMLVideoElement> =>
		(video) => {
			if (!source) {
				return;
			}

			const start = this.#resume ?? untrack(() => this.time);
			this.#resume = undefined;
			this.failure = undefined;

			let hls: Hls | undefined;
			let detached = false;

			const direct = () => {
				if (source.format === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
					this.failure = "This browser cannot play HLS streams.";
					return;
				}

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

							this.failure =
								data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
									? "This stream is not a valid HLS playlist."
									: "The stream stopped loading.";
						});
						instance.loadSource(source.url);
						instance.attachMedia(video);
						hls = instance;
					})
					.catch(() => {
						if (!detached) {
							this.failure = "The player could not be loaded.";
						}
					});
			} else {
				direct();
			}

			return () => {
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
