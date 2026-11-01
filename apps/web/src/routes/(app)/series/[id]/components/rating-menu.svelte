<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import Star from "$lib/components/ui/star.svelte";
	import Tooltip from "$lib/components/ui/tooltip.svelte";
	import { cn } from "$lib/utils";
	import type { Series } from "@sora/sdk";
	import { CaretDownIcon } from "phosphor-svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { getRating, setRating } from "../rating.remote";

	let {
		series,
		rating,
	}: {
		series: Series;
		rating: number;
	} = $props();

	const stars = [1, 2, 3, 4, 5] as const;
	const bars = [5, 4, 3, 2, 1] as const;

	const compact = new MediaQuery("max-width: 639px");

	let preview = $state(0);
	let choosing = $state(false);

	const own = $derived(await getRating(series.id));
	const mine = $derived(own.rating);
	const counts = $derived(series.score_stars);
	const total = $derived(counts?.reduce((sum, count) => sum + count, 0) ?? 0);
	const share = (star: number) => (total > 0 ? (counts?.[star - 1] ?? 0) / total : 0);
	const plural = (star: number) => (star === 1 ? "star" : "stars");

	const fill = (star: number) => {
		const shown = preview || mine;
		return shown ? Number(star <= shown) : Math.min(Math.max(rating - (star - 1), 0), 1);
	};

	const rate = (star: number) =>
		setRating({
			rating: mine === star ? null : star,
			seriesId: series.id,
		});
</script>

{#snippet summary()}
	<div class="px-5 pt-3 pb-2 text-sm">
		{#if mine}
			<p class="text-muted">You rated this {mine} out of 5 stars</p>
		{/if}
		<p class="text-muted">
			Average {rating.toFixed(1)} out of 5 stars
			{#if series.score_count}
				&bull; {series.score_count.toLocaleString("en-US")} ratings
			{/if}
		</p>
	</div>
{/snippet}

{#snippet distribution()}
	<ul class="pb-3">
		{#each bars as star (star)}
			<li
				class={cn(
					"flex h-8 items-center gap-3 px-5 text-sm text-foreground",
					mine === star && "text-accent",
				)}
			>
				<span class="flex w-8 shrink-0 items-center gap-1">
					<Star size="1.1rem" filled />
					{star}
				</span>
				<span class="h-2 min-w-0 flex-1 bg-hover" aria-hidden="true">
					<span
						class={cn("block h-full bg-foreground", mine === star && "bg-accent")}
						style:width="{share(star) * 100}%"
					></span>
				</span>
				<span class="w-10 shrink-0 text-right tabular-nums">
					{Math.round(share(star) * 100)}%
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet labelled()}
	<span class="flex items-center gap-1.5 font-medium">
		<span
			class="decoration-foreground underline-offset-4 in-aria-expanded:underline in-[button:hover]:underline"
		>
			<span
				class="text-muted in-aria-expanded:text-foreground in-[button:hover]:text-foreground max-sm:sr-only"
			>
				Average rating:
			</span>
			<strong class="text-foreground">
				{rating.toFixed(1)}
				{#if series.score_count}
					({series.score_count.toLocaleString("en-US", {
						notation: "compact",
					})})
				{/if}
			</strong>
		</span>
		<CaretDownIcon size="1rem" weight="bold" class="text-foreground" aria-hidden="true" />
	</span>
{/snippet}

<span
	class="flex items-center gap-0.5"
	role="group"
	aria-label="Rate this title"
	onpointerleave={() => (preview = 0)}
>
	{#each stars as star (star)}
		<Tooltip text="Rate this {star} {plural(star)}">
			{#snippet children(anchor)}
				<button
					{...anchor}
					type="button"
					class={cn(
						"relative size-6 shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
						preview > 0 || mine ? "text-accent" : "text-muted",
					)}
					aria-label="Rate this {star} {plural(star)}"
					aria-pressed={mine === star}
					onpointerenter={() => (preview = compact.current ? 0 : star)}
					onfocus={() => (preview = compact.current ? 0 : star)}
					onblur={() => (preview = 0)}
					onclick={() => (compact.current ? (choosing = true) : rate(star))}
				>
					<Star size="1.5rem" />
					<span class="absolute inset-y-0 left-0 overflow-hidden" style:width="{fill(star) * 100}%">
						<Star size="1.5rem" filled class="max-w-none" />
					</span>
				</button>
			{/snippet}
		</Tooltip>
	{/each}
</span>

<span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>

<div class="flex h-6 items-center max-sm:hidden">
	<Dropdown
		variant="text"
		alignment="left"
		class="w-72 max-w-[calc(100vw-2.5rem)]"
		label="Average rating {rating.toFixed(1)}, rating details"
	>
		{#snippet trigger()}
			{@render labelled()}
		{/snippet}

		{#snippet children()}
			{@render summary()}
			{@render distribution()}
		{/snippet}
	</Dropdown>
</div>

<Button
	variant="text"
	class="h-6 sm:hidden"
	aria-label="Average rating {rating.toFixed(1)}, rate this title"
	aria-haspopup="dialog"
	aria-controls="series-rating"
	aria-expanded={choosing}
	onclick={() => (choosing = true)}
>
	{@render labelled()}
</Button>

<Sheet bind:open={choosing} id="series-rating" title="Rating">
	{@render summary()}
	<div
		class="flex items-center justify-center gap-2 px-5 py-4"
		role="group"
		aria-label="Your rating"
	>
		{#each stars as star (star)}
			<button
				type="button"
				class="size-12 cursor-pointer text-accent outline-none focus-visible:outline-2 focus-visible:outline-accent"
				aria-label="Rate this {star} {plural(star)}"
				aria-pressed={mine === star}
				onclick={() => rate(star)}
			>
				<Star size="2.5rem" filled={mine !== null && star <= mine} />
			</button>
		{/each}
	</div>
	{@render distribution()}
</Sheet>
