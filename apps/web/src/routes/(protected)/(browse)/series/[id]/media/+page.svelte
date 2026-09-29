<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, CaretLeftIcon } from "phosphor-svelte";

	import { getSeries } from "../series.remote";
	import type { PageProps } from "./$types";
	import Filters from "./_components/Filters.svelte";
	import Images from "./_components/Images.svelte";
	import Sizing from "./_components/Sizing.svelte";
	import { Media } from "./media.svelte";

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const media = new Media();

	let sizing = $state(false);

	const arranging = $derived(sizing && media.type === "logo" && !!series.logo_url);
	const placed = $derived(
		series.logo_scale !== 1 || series.logo_offset_x !== 0 || series.logo_offset_y !== 0,
	);

	const types = [
		{
			value: "poster",
			label: "Posters",
		},
		{
			value: "backdrop",
			label: "Backdrops",
		},
		{
			value: "logo",
			label: "Logos",
		},
	] as const;

	const grids = {
		poster: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6",
		backdrop: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
		logo: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
	};
</script>

<svelte:head>
	<title>Media · {series.title}</title>
</svelte:head>

<main
	class={cn(
		"bg-canvas px-5 pt-8 text-foreground sm:px-10 sm:pt-10 lg:px-16",
		arranging ? "flex h-[calc(100dvh-3.5rem)] flex-col pb-8" : "min-h-[calc(100dvh-3.5rem)] pb-16",
	)}
>
	<header class="flex items-center gap-2">
		<a
			href="/series/{series.id}"
			class="-ml-2 grid size-10 shrink-0 place-items-center text-muted transition-colors hover:text-foreground"
			aria-label="Back to {series.title}"
		>
			<CaretLeftIcon size="1.5rem" weight="bold" />
		</a>
		<h1 class="text-3xl font-bold">Media</h1>
	</header>

	<div class="mt-6 flex items-center gap-4 border-b border-border sm:gap-6">
		<nav class="min-w-0" aria-label="Type">
			<ul class="-mb-px flex gap-5 sm:gap-8" role="radiogroup">
				{#each types as option (option.value)}
					{@const checked = media.type === option.value}
					<li>
						<button
							type="button"
							role="radio"
							aria-checked={checked}
							class={cn(
								"inline-flex h-12 cursor-pointer items-center border-b-2 text-sm font-bold tracking-wide uppercase transition-colors hover:text-foreground",
								checked
									? "border-accent text-foreground"
									: "border-transparent text-dropdown-foreground",
							)}
							onclick={() => {
								sizing = false;
								media.type = option.value;
							}}
						>
							{option.label}
						</button>
					</li>
				{/each}
			</ul>
		</nav>
		{#if arranging}
			<Button
				class="ml-auto gap-2 text-xs font-bold tracking-wide text-dropdown-foreground uppercase hover:text-foreground"
				disabled={!placed}
				onclick={() =>
					media.place(series.id, {
						scale: 1,
						x: 0,
						y: 0,
					})}
			>
				<ArrowCounterClockwiseIcon size="1rem" weight="bold" />
				<span class="max-sm:sr-only">Reset</span>
			</Button>
		{:else}
			<Button
				class="ml-auto gap-2 text-xs font-bold tracking-wide text-dropdown-foreground uppercase hover:text-foreground"
				disabled={media.refreshing}
				onclick={() => media.refresh(series.id)}
			>
				<ArrowsClockwiseIcon
					size="1rem"
					weight="bold"
					class={cn(media.refreshing && "animate-spin motion-reduce:animate-none")}
				/>
				<span class="max-sm:sr-only">{media.refreshing ? "Refreshing" : "Refresh"}</span>
			</Button>
		{/if}
	</div>

	{#if media.type === "logo" && series.logo_url}
		<nav class="mt-4" aria-label="Logos">
			<ul class="flex gap-1" role="radiogroup">
				{#each [{ sizing: false, label: "All logos" }, { sizing: true, label: "Sizing" }] as option (option.label)}
					<li>
						<button
							type="button"
							role="radio"
							aria-checked={sizing === option.sizing}
							class={cn(
								"inline-flex h-9 cursor-pointer items-center px-3 text-xs font-bold tracking-wide uppercase transition-colors hover:text-foreground",
								sizing === option.sizing
									? "bg-panel-hover text-foreground"
									: "text-dropdown-foreground",
							)}
							onclick={() => (sizing = option.sizing)}
						>
							{option.label}
						</button>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}

	{#if arranging}
		<section class="mt-6 flex min-h-0 flex-1 flex-col" aria-label="Logo sizing">
			{#if media.error}
				<p class="mb-6 text-sm text-status-error" role="alert">{media.error}</p>
			{/if}

			<div class="@container-[size] min-h-0 flex-1">
				<svelte:boundary>
					{#snippet pending()}
						<Skeleton class="mx-auto aspect-video w-[min(100cqw,calc(100cqh*16/9))]" />
					{/snippet}

					<Sizing {series} {media} />
				</svelte:boundary>
			</div>
		</section>
	{:else}
		<div class="mt-8 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
			<aside
				class="grid content-start gap-7 lg:sticky lg:top-22 lg:max-h-[calc(100dvh-7rem)] lg:[scrollbar-width:thin] lg:[scrollbar-color:var(--color-border)_transparent] lg:self-start lg:overflow-y-auto"
			>
				<svelte:boundary>
					{#snippet pending()}{/snippet}

					<Filters seriesId={series.id} {media} />
				</svelte:boundary>
			</aside>

			<section aria-label="Choose {media.type}">
				{#if media.error}
					<p class="mb-6 text-sm text-status-error" role="alert">{media.error}</p>
				{/if}

				<svelte:boundary>
					{#snippet pending()}
						<ul
							class={cn("grid gap-x-5 gap-y-7", grids[media.type])}
							aria-busy="true"
							aria-label="Loading images"
						>
							{#each { length: 12 }, index (index)}
								<li>
									<Skeleton class={media.type === "poster" ? "aspect-2/3" : "aspect-video"} />
									<Skeleton class="mt-3 h-3 w-1/2" />
									<Skeleton class="mt-2 h-3 w-2/3" />
								</li>
							{/each}
						</ul>
					{/snippet}

					<Images {series} {media} grid={grids[media.type]} />
				</svelte:boundary>
			</section>
		</div>
	{/if}
</main>
