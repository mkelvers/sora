import type { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from "embla-carousel";
import type { AutoplayType } from "embla-carousel-autoplay";
import { getContext, setContext } from "svelte";
import { prefersReducedMotion } from "svelte/motion";

export class CarouselState {
	api = $state<EmblaCarouselType>();
	active = $state(0);
	canPrevious = $state(false);
	canNext = $state(false);
	paused = $state(false);
	cycle = $state(0);

	constructor(
		readonly options: () => EmblaOptionsType,
		readonly plugins: () => EmblaPluginType[],
	) {}

	attach(api: EmblaCarouselType) {
		if (this.api === api) {
			return;
		}

		this.api = api;

		const autoplay = api.plugins().autoplay as AutoplayType | undefined;
		if (prefersReducedMotion.current || api.scrollSnapList().length < 2) {
			autoplay?.stop();
		}

		const sync = () => {
			this.active = api.selectedScrollSnap();
			this.canPrevious = api.canScrollPrev();
			this.canNext = api.canScrollNext();
		};

		api.on("init", sync).on("reInit", sync).on("select", sync);
		api.on("select", () => autoplay?.reset());
		api.on("autoplay:play", () => (this.paused = false));
		api.on("autoplay:stop", () => (this.paused = true));
		api.on("autoplay:timerset", () => this.cycle++);

		this.paused = !autoplay?.isPlaying();
		sync();
	}

	select(index: number) {
		this.api?.scrollTo(index);
		(this.api?.plugins().autoplay as AutoplayType | undefined)?.reset();
	}
}

const key = Symbol("carousel");

export function setCarousel(state: CarouselState) {
	return setContext(key, state);
}

export function getCarousel() {
	return getContext<CarouselState>(key);
}
