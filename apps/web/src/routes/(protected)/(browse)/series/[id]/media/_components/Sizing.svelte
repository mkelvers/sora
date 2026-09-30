<script lang="ts">
	import { cn } from "$lib/utils";
	import Hero from "$routes/(protected)/(browse)/series/[id]/_components/Hero.svelte";
	import type { Media } from "$routes/(protected)/(browse)/series/[id]/media/media.svelte";
	import { getProgress } from "$routes/(protected)/(browse)/series/[id]/series.remote";
	import type { Series } from "@sora/sdk";

	type Props = {
		series: Series;
		media: Media;
	};

	let { series, media }: Props = $props();

	const progress = $derived(await getProgress(series.id));

	let scale = $derived(series.logo_scale);
	let x = $derived(series.logo_offset_x);
	let y = $derived(series.logo_offset_y);

	let stage: HTMLElement | undefined;
	let box = $state<{
		left: number;
		top: number;
		width: number;
		height: number;
	}>();
	let drag = $state<{
		corner?: {
			x: number;
			y: number;
		};
		pointerX: number;
		pointerY: number;
		scale: number;
		x: number;
		y: number;
		hero: DOMRect;
		logo: DOMRect;
	}>();

	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

	let target = $state<"logo" | "nwse" | "nesw">();

	const corners = [
		{
			x: -1,
			y: -1,
			class: "-top-1.5 -left-1.5",
		},
		{
			x: 1,
			y: -1,
			class: "-top-1.5 -right-1.5",
		},
		{
			x: -1,
			y: 1,
			class: "-bottom-1.5 -left-1.5",
		},
		{
			x: 1,
			y: 1,
			class: "-right-1.5 -bottom-1.5",
		},
	];

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
		media.place(series.id, {
			scale,
			x,
			y,
		});
	}

	function hit(event: PointerEvent, logo: DOMRect) {
		const reach = event.pointerType === "touch" ? 24 : 10;
		const corner = corners.find(
			(corner) =>
				Math.abs(event.clientX - (corner.x < 0 ? logo.left : logo.right)) <= reach &&
				Math.abs(event.clientY - (corner.y < 0 ? logo.top : logo.bottom)) <= reach,
		);
		if (corner) {
			return corner;
		}

		const inside =
			event.clientX >= logo.left &&
			event.clientX <= logo.right &&
			event.clientY >= logo.top &&
			event.clientY <= logo.bottom;
		return inside ? "logo" : undefined;
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
			corner: found === "logo" ? undefined : found,
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
			const found = hit(event, elements().logo.getBoundingClientRect());
			target = found === "logo" || !found ? found : found.x === found.y ? "nwse" : "nesw";
			return;
		}

		const { corner, hero, logo } = drag;
		if (!corner) {
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
			x = clamp(drag.x + dx / hero.width, -1, 1);
			y = clamp(drag.y + dy / hero.width, -1, 1);
			return;
		}

		const anchorX = corner.x > 0 ? logo.left : logo.right;
		const anchorY = corner.y > 0 ? logo.top : logo.bottom;
		const along =
			((event.clientX - anchorX) * corner.x * logo.width +
				(event.clientY - anchorY) * corner.y * logo.height) /
			(logo.width ** 2 + logo.height ** 2);
		scale = clamp(Math.round(drag.scale * along * 100) / 100, 0.5, 2);

		const factor = scale / drag.scale;
		const dx = corner.x < 0 ? logo.width * (1 - factor) : 0;
		const dy = corner.y > 0 ? logo.height * (factor - 1) : 0;
		x = clamp(drag.x + dx / hero.width, -1, 1);
		y = clamp(drag.y + dy / hero.width, -1, 1);
	}

	function end() {
		if (drag) {
			drag = undefined;
			save();
		}
	}

	const arrows: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1],
	};

	const keys = ["+", "=", "-", ...Object.keys(arrows)];

	function nudge(event: KeyboardEvent) {
		const arrow = arrows[event.key];
		const grow = {
			"+": 1,
			"=": 1,
			"-": -1,
		}[event.key];
		if (!arrow && !grow) {
			return;
		}

		event.preventDefault();
		if (arrow) {
			const step = event.shiftKey ? 0.02 : 0.005;
			x = clamp(x + arrow[0] * step, -1, 1);
			y = clamp(y + arrow[1] * step, -1, 1);
		} else if (grow) {
			scale = clamp(Math.round((scale + grow * 0.05) * 100) / 100, 0.5, 2);
		}
	}
</script>

<div class="mx-auto w-[min(100cqw,calc(100cqh*16/9))]">
	<div
		{@attach track}
		class={cn(
			"relative isolate touch-none select-none [&_.series-hero]:max-h-none [&_.series-hero]:min-h-auto",
			drag && !drag.corner && "cursor-grabbing",
			!drag && target === "logo" && "cursor-grab",
			(drag?.corner ? drag.corner.x === drag.corner.y : target === "nwse") && "cursor-nwse-resize",
			(drag?.corner ? drag.corner.x !== drag.corner.y : target === "nesw") && "cursor-nesw-resize",
		)}
		role="presentation"
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
		onpointerleave={() => {
			if (!drag) {
				target = undefined;
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
				{progress}
			/>
		</div>

		{#if box}
			<button
				type="button"
				aria-roledescription="logo"
				aria-label="Logo, {Math.round(scale * 100)}%. Arrow keys move it, plus and minus resize it."
				class="pointer-events-none absolute z-40 outline-1 outline-offset-0 outline-white/80 outline-dashed focus-visible:outline-2 focus-visible:outline-solid"
				style:left="{box.left}px"
				style:top="{box.top}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
				onkeydown={nudge}
				onkeyup={(event) => {
					if (keys.includes(event.key)) {
						save();
					}
				}}
			>
				{#each corners as corner (corner.class)}
					<span
						class={cn(
							"absolute size-3 border border-black/40 bg-white pointer-coarse:size-4",
							corner.class,
						)}
					></span>
				{/each}
			</button>
		{/if}
	</div>
</div>
