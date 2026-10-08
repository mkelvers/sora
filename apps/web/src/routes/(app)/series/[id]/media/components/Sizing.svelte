<script lang="ts">
	import { cn } from "$lib/utils";
	import Hero from "$routes/(app)/series/[id]/components/Hero.svelte";
	import type { Media } from "$routes/(app)/series/[id]/media/media.svelte";
	import type { Series } from "@sora/sdk";

	let {
		series,
		media,
	}: {
		series: Series;
		media: Media;
	} = $props();

	let scale = $derived(series.logo_scale);
	let x = $derived(series.logo_offset_x);
	let y = $derived(series.logo_offset_y);

	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

	const corners = [
		{
			x: -1,
			y: -1,
		},
		{
			x: 1,
			y: -1,
		},
		{
			x: -1,
			y: 1,
		},
		{
			x: 1,
			y: 1,
		},
	];
	type Handle = (typeof corners)[number] | "logo";

	const unit = (value: number) => clamp(value, -1, 1);
	const zoomed = (value: number) => clamp(Math.round(value * 100) / 100, 0.5, 2);

	let stage: HTMLElement | undefined;
	let box = $state<{
		left: number;
		top: number;
		width: number;
		height: number;
	}>();
	let hovered = $state<Handle>();
	let drag = $state<{
		handle: Handle;
		pointerX: number;
		pointerY: number;
		scale: number;
		x: number;
		y: number;
		hero: DOMRect;
		logo: DOMRect;
	}>();

	const handle = $derived(drag?.handle ?? hovered);
	const cursor = $derived(
		handle === "logo"
			? drag
				? "cursor-grabbing"
				: "cursor-grab"
			: handle
				? handle.x === handle.y
					? "cursor-nwse-resize"
					: "cursor-nesw-resize"
				: undefined,
	);

	function elements() {
		return {
			hero: stage!.querySelector<HTMLElement>(".series-hero")!,
			logo: stage!.querySelector<HTMLImageElement>("[data-hero-logo]")!,
		};
	}

	function measure() {
		const frame = stage!.getBoundingClientRect();
		const logo = elements().logo.getBoundingClientRect();
		box = {
			left: logo.left - frame.left,
			top: logo.top - frame.top,
			width: logo.width,
			height: logo.height,
		};
	}

	$effect(() => {
		void [scale, x, y];
		if (stage) {
			measure();
		}
	});

	function track(node: HTMLElement) {
		stage = node;
		const observer = new ResizeObserver(() => {
			const { hero, logo } = elements();
			for (const element of [hero, logo, logo.parentElement!.parentElement!]) {
				observer.observe(element);
			}
			measure();
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			stage = undefined;
		};
	}

	function save() {
		media.place({
			scale,
			x,
			y,
		});
	}

	function hit(event: PointerEvent, logo: DOMRect): Handle | undefined {
		const reach = event.pointerType === "touch" ? 24 : 10;
		const corner = corners.find(
			(corner) =>
				Math.abs(event.clientX - (corner.x < 0 ? logo.left : logo.right)) <= reach &&
				Math.abs(event.clientY - (corner.y < 0 ? logo.top : logo.bottom)) <= reach,
		);
		const inside =
			event.clientX >= logo.left &&
			event.clientX <= logo.right &&
			event.clientY >= logo.top &&
			event.clientY <= logo.bottom;
		return corner ?? (inside ? "logo" : undefined);
	}

	function start(event: PointerEvent) {
		if (event.button !== 0) {
			return;
		}

		measure();
		const { hero, logo } = elements();
		const rect = logo.getBoundingClientRect();
		const found = hit(event, rect);
		if (!found) {
			return;
		}

		event.preventDefault();
		stage!.setPointerCapture(event.pointerId);
		drag = {
			handle: found,
			pointerX: event.clientX,
			pointerY: event.clientY,
			scale,
			x,
			y,
			hero: hero.getBoundingClientRect(),
			logo: rect,
		};
	}

	function move(event: PointerEvent) {
		if (!drag) {
			measure();
			hovered = hit(event, elements().logo.getBoundingClientRect());
			return;
		}

		const { handle, hero, logo } = drag;
		if (handle === "logo") {
			const dx = clamp(
				event.clientX - drag.pointerX,
				Math.min(0, hero.left - logo.left),
				Math.max(0, hero.right - logo.right),
			);
			const dy = clamp(
				event.clientY - drag.pointerY,
				Math.min(0, hero.top - logo.top),
				Math.max(0, hero.bottom - logo.bottom),
			);
			x = unit(drag.x + dx / hero.width);
			y = unit(drag.y + dy / hero.width);
			return;
		}

		const anchorX = handle.x > 0 ? logo.left : logo.right;
		const anchorY = handle.y > 0 ? logo.top : logo.bottom;
		const along =
			((event.clientX - anchorX) * handle.x * logo.width +
				(event.clientY - anchorY) * handle.y * logo.height) /
			(logo.width ** 2 + logo.height ** 2);
		scale = zoomed(drag.scale * along);

		const factor = scale / drag.scale;
		x = unit(drag.x + (handle.x < 0 ? logo.width * (1 - factor) : 0) / hero.width);
		y = unit(drag.y + (handle.y > 0 ? logo.height * (factor - 1) : 0) / hero.width);
	}

	function end() {
		if (drag) {
			drag = undefined;
			save();
		}
	}

	const moves: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1],
	};
	const zooms: Record<string, number> = {
		"+": 1,
		"=": 1,
		"-": -1,
	};

	function nudge(event: KeyboardEvent) {
		const direction = moves[event.key];
		const zoom = zooms[event.key];
		if (!direction && !zoom) {
			return;
		}

		event.preventDefault();
		if (direction) {
			const step = event.shiftKey ? 0.02 : 0.005;
			x = unit(x + direction[0] * step);
			y = unit(y + direction[1] * step);
		} else {
			scale = zoomed(scale + zoom * 0.05);
		}
	}
</script>

<div class="mx-auto w-[min(100cqw,calc(100cqh*16/9))]">
	<div
		{@attach track}
		class={cn(
			"relative isolate touch-none select-none [&_.series-hero]:max-h-none [&_.series-hero]:min-h-auto",
			cursor,
		)}
		role="presentation"
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
		onpointerleave={() => {
			if (!drag) {
				hovered = undefined;
			}
		}}
	>
		<div inert>
			<Hero
				series={{
					...series,
					logo_scale: scale,
					logo_offset_x: x,
					logo_offset_y: y,
				}}
			/>
		</div>

		{#if box}
			<button
				type="button"
				aria-roledescription="logo"
				class="pointer-events-none absolute z-40 outline-1 outline-offset-0 outline-white/80 outline-dashed [--size:0.75rem] [background:linear-gradient(#fff,#fff)_top_left/var(--size)_var(--size)_no-repeat,linear-gradient(#fff,#fff)_top_right/var(--size)_var(--size)_no-repeat,linear-gradient(#fff,#fff)_bottom_left/var(--size)_var(--size)_no-repeat,linear-gradient(#fff,#fff)_bottom_right/var(--size)_var(--size)_no-repeat] focus-visible:outline-2 focus-visible:outline-solid pointer-coarse:[--size:1rem]"
				style:left="{box.left}px"
				style:top="{box.top}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
				onkeydown={nudge}
				onkeyup={(event) => {
					if (event.key in moves || event.key in zooms) {
						save();
					}
				}}
			>
				<span class="sr-only">
					Logo, {Math.round(scale * 100)}%. Arrow keys move it, plus and minus resize it.
				</span>
			</button>
		{/if}
	</div>
</div>
