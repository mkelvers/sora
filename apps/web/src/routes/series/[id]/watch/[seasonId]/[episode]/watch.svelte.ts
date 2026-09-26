import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import type { PlaybackMedia } from '@sora/sdk';

type Source = PlaybackMedia['sources'][number];

/** The state of a player: its video, the captions it shows, and its chrome. */
export class Player {
	root = $state<HTMLElement>();
	paused = $state(true);
	time = $state(0);
	duration = $state(0);
	buffered = $state<{ start: number; end: number }[]>([]);
	volume = $state(1);
	muted = $state(false);
	speed = $state(1);
	readyState = $state(0);
	failure = $state<string>();
	fullscreen = $state(false);
	/** Whether the pointer has rested long enough to hide the controls. */
	idle = $state(false);
	cues = $state<VTTCue[]>([]);

	/** Where the stream has loaded to from the current time. */
	loaded = $derived(this.buffered.find((range) => range.start <= this.time && this.time <= range.end)?.end ?? 0);
	buffering = $derived(this.readyState < 3 && !this.paused);

	#timer: ReturnType<typeof setTimeout> | undefined;
	#dismissing = false;

	toggle = () => {
		this.paused = !this.paused;
	};

	seek = (seconds: number) => {
		this.time += seconds;
	};

	/** Shows the controls, and hides them again once the pointer rests. */
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

	onfullscreenchange = () => {
		this.fullscreen = document.fullscreenElement === this.root;
	};

	// A click that closes an open menu should not also pause the video.
	onpointerdown = () => {
		this.#dismissing = document.querySelector(':popover-open') !== null;
	};

	onclick = () => {
		if (!this.#dismissing) {
			this.toggle();
		}
	};

	onkeydown = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement;
		if (event.metaKey || event.ctrlKey || target.closest('input, [popover]') || (event.key === ' ' && target.closest('button, a'))) {
			return;
		}

		const action = {
			' ': this.toggle,
			k: this.toggle,
			ArrowLeft: () => this.seek(-10),
			ArrowRight: () => this.seek(10),
			m: () => (this.muted = !this.muted),
			f: this.toggleFullscreen
		}[event.key];

		if (action) {
			event.preventDefault();
			action();
			this.wake();
		}
	};

	/** Plays a source in the video, picking up where the last one left off. */
	stream = (source: Source | undefined): Attachment<HTMLVideoElement> => (video) => {
		if (!source) {
			return;
		}

		const start = untrack(() => this.time);
		let hls: import('hls.js').default | undefined;
		let cancelled = false;
		this.failure = undefined;

		import('hls.js').then(({ default: Hls }) => {
			if (cancelled) {
				return;
			}

			if (source.format === 'hls' && Hls.isSupported()) {
				hls = new Hls({ startPosition: start });
				hls.on(Hls.Events.ERROR, (_, data) => {
					if (data.fatal) {
						this.failure =
							data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
								? 'This stream is not a valid HLS playlist.'
								: 'The stream stopped loading.';
					}
				});
				hls.loadSource(source.url);
				hls.attachMedia(video);
			} else if (source.format === 'mp4' || video.canPlayType('application/vnd.apple.mpegurl')) {
				video.src = source.url;
				video.currentTime = start;
			} else {
				this.failure = 'This browser cannot play HLS streams.';
				return;
			}

			video.play().catch(() => {});
		});

		return () => {
			cancelled = true;
			hls?.destroy();
			video.removeAttribute('src');
			video.load();
		};
	};

	/** Shows a subtitle track's cues when it is the chosen one. */
	caption = (shown: boolean): Attachment<HTMLTrackElement> => (element) => {
		const track = element.track;
		if (!shown) {
			track.mode = 'disabled';
			return;
		}

		track.mode = 'hidden';
		track.oncuechange = () => (this.cues = [...(track.activeCues ?? [])] as VTTCue[]);
		return () => {
			track.oncuechange = null;
			this.cues = [];
		};
	};
}
