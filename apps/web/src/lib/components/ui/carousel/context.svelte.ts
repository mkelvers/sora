import type { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from "embla-carousel";
import { createContext, untrack } from "svelte";
import { prefersReducedMotion } from "svelte/motion";

export type CarouselOptions = Omit<EmblaOptionsType, "watchDrag" | "watchFocus">;

export class CarouselState {
	api = $state<EmblaCarouselType>();
	active = $state(0);
	scrollable = $state(false);
	canPrevious = $state(false);
	canNext = $state(false);
	paused = $state(true);
	stopped = $state(false);
	cycle = $state(0);

	#restart?: () => void;
	#toggle?: () => void;

	constructor(
		readonly options: () => CarouselOptions,
		readonly plugins: () => EmblaPluginType[],
	) {}

	attach(api: EmblaCarouselType) {
		if (this.api === api) {
			return;
		}

		this.api = api;

		const sync = () => {
			this.active = api.selectedScrollSnap();
			this.canPrevious = this.scrollable && api.canScrollPrev();
			this.canNext = this.scrollable && api.canScrollNext();
		};

		const measure = () => {
			const { axis, containerRect, slideRects } = api.internalEngine();
			const last = slideRects.at(-1);

			this.scrollable =
				!!last &&
				Math.abs(last[axis.endEdge] - containerRect[axis.startEdge]) >
					axis.measureSize(containerRect) + 2;

			if (!this.scrollable && api.selectedScrollSnap() > 0) {
				api.scrollTo(0, true);
			}

			sync();
		};

		api.on("init", measure).on("reInit", measure).on("select", sync);
		measure();
	}

	autoplay(delay: number) {
		const api = this.api;
		if (!api || prefersReducedMotion.current) {
			return;
		}

		return untrack(() => {
			if (api.scrollSnapList().length < 2) {
				return;
			}

			let remaining = delay;
			let started = 0;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const pause = () => {
				if (timer === undefined) {
					return;
				}

				clearTimeout(timer);
				timer = undefined;
				remaining -= performance.now() - started;
				this.paused = true;
			};

			const resume = () => {
				if (timer !== undefined || document.hidden || this.stopped) {
					return;
				}

				started = performance.now();
				timer = setTimeout(() => api.scrollNext(), remaining);
				this.paused = false;
			};

			const restart = () => {
				clearTimeout(timer);
				timer = undefined;
				remaining = delay;
				this.cycle++;
				resume();
			};

			const visibility = () => (document.hidden ? pause() : resume());

			const root = api.rootNode().closest("section");
			const leave = (event: FocusEvent) => {
				if (!root?.contains(event.relatedTarget as Node | null)) {
					resume();
				}
			};

			api.on("select", restart).on("pointerDown", pause).on("pointerUp", resume);
			document.addEventListener("visibilitychange", visibility);
			root?.addEventListener("focusin", pause);
			root?.addEventListener("focusout", leave);
			this.#restart = restart;
			this.#toggle = () => {
				this.stopped = !this.stopped;
				if (this.stopped) {
					pause();
				} else {
					resume();
				}
			};
			restart();

			return () => {
				clearTimeout(timer);
				api.off("select", restart).off("pointerDown", pause).off("pointerUp", resume);
				document.removeEventListener("visibilitychange", visibility);
				root?.removeEventListener("focusin", pause);
				root?.removeEventListener("focusout", leave);
				this.#restart = undefined;
				this.#toggle = undefined;
				this.paused = true;
			};
		});
	}

	toggle() {
		this.#toggle?.();
	}

	select(index: number) {
		if (index === this.active) {
			this.#restart?.();
			return;
		}

		this.api?.scrollTo(index);
	}
}

export const [getCarousel, setCarousel] = createContext<CarouselState>();
