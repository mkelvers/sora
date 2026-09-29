import type { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from "embla-carousel";
import { getContext, setContext, untrack } from "svelte";
import { prefersReducedMotion } from "svelte/motion";

export class CarouselState {
	api = $state<EmblaCarouselType>();
	active = $state(0);
	canPrevious = $state(false);
	canNext = $state(false);
	paused = $state(true);
	cycle = $state(0);

	#restart?: () => void;

	constructor(
		readonly options: () => EmblaOptionsType,
		readonly plugins: () => EmblaPluginType[],
	) {}

	attach(api: EmblaCarouselType) {
		if (this.api === api) {
			return;
		}

		this.api = api;

		const sync = () => {
			this.active = api.selectedScrollSnap();
			this.canPrevious = api.canScrollPrev();
			this.canNext = api.canScrollNext();
		};

		api.on("init", sync).on("reInit", sync).on("select", sync);
		sync();
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
				if (timer !== undefined || document.hidden) {
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

			api.on("select", restart).on("pointerDown", pause).on("pointerUp", resume);
			document.addEventListener("visibilitychange", visibility);
			this.#restart = restart;
			restart();

			return () => {
				clearTimeout(timer);
				api.off("select", restart).off("pointerDown", pause).off("pointerUp", resume);
				document.removeEventListener("visibilitychange", visibility);
				this.#restart = undefined;
				this.paused = true;
			};
		});
	}

	select(index: number) {
		if (index === this.active) {
			this.#restart?.();
			return;
		}

		this.api?.scrollTo(index);
	}
}

const key = Symbol("carousel");

export function setCarousel(state: CarouselState) {
	return setContext(key, state);
}

export function getCarousel() {
	return getContext<CarouselState>(key);
}
