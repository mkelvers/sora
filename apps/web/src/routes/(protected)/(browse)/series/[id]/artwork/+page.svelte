<script lang="ts">
	import Filters from "./_components/Filters.svelte";
	import Images from "./_components/Images.svelte";
	import { ArrowCounterClockwiseIcon, CaretLeftIcon } from "phosphor-svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import { Artwork } from "./artwork.svelte";
	import { getSeries } from "../series.remote";
	import type { PageProps } from "./$types";

	let {
		params,
	}: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const artwork = new Artwork();

	const types = [
		{
			value: "poster",
			label: "Posters",
		},
		{
			value: "backdrop",
			label: "Backdrops",
		},
	] as const;
</script>

<svelte:head>
	<title>Artwork · {series.title}</title>
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
	<div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
		<div class="flex items-center gap-3">
			<a
				href="/series/{series.id}"
				class="grid size-10 place-items-center text-muted transition-colors hover:text-foreground"
				aria-label="Back to {series.title}"
			>
				<CaretLeftIcon size="1.5rem" weight="bold" />
			</a>
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-semibold">Artwork</h1>
				<p class="truncate text-sm text-muted">{series.title}</p>
			</div>
			<Button
				class="min-h-10 gap-2 border-2 border-border-strong px-4 text-xs font-bold text-muted uppercase hover:border-foreground hover:text-foreground"
				onclick={() => artwork.choose(series.id, null)}
			>
				<ArrowCounterClockwiseIcon size="1rem" weight="bold" />
				Use default
			</Button>
		</div>

		<nav class="mt-8 border-b border-border" aria-label="Type">
			<ul class="-mb-px flex gap-7" role="radiogroup">
				{#each types as option (option.value)}
					<li>
						<button
							type="button"
							role="radio"
							aria-checked={artwork.type === option.value}
							class={cn(
								"inline-flex h-12 cursor-pointer items-center border-b-2 text-sm font-medium transition-colors hover:text-foreground",
								artwork.type === option.value ? "border-accent text-foreground" : "border-transparent text-muted",
							)}
							onclick={() => (artwork.type = option.value)}
						>
							{option.label}
						</button>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="mt-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
			<aside class="grid content-start gap-6">
				<svelte:boundary>
					{#snippet pending()}{/snippet}

					<Filters seriesId={series.id} {artwork} />
				</svelte:boundary>
			</aside>

			<section>
				{#if artwork.error}
					<p class="mb-6 text-sm text-status-error" role="alert">{artwork.error}</p>
				{/if}

				<svelte:boundary>
					{#snippet pending()}
						<ul
							class={cn(
								"grid gap-x-5 gap-y-8",
								artwork.type === "poster" ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-6" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
							)}
							aria-busy="true"
							aria-label="Loading images"
						>
							{#each { length: 12 }, index (index)}
								<li>
									<Skeleton class={artwork.type === "poster" ? "aspect-2/3" : "aspect-video"} />
									<Skeleton class="mt-3 h-3 w-1/2" />
									<Skeleton class="mt-2 h-3 w-2/3" />
								</li>
							{/each}
						</ul>
					{/snippet}

					<Images {series} {artwork} />
				</svelte:boundary>
			</section>
		</div>
	</div>
</main>
