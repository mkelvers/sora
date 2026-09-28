<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { ArrowsClockwiseIcon, CaretLeftIcon } from "phosphor-svelte";

	import { getSeries } from "../series.remote";
	import type { PageProps } from "./$types";
	import Filters from "./_components/Filters.svelte";
	import Images from "./_components/Images.svelte";
	import { Media } from "./media.svelte";

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const media = new Media();

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
	class="min-h-[calc(100dvh-3.5rem)] bg-canvas px-5 pt-8 pb-16 text-foreground sm:px-10 sm:pt-10 lg:px-16"
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

	<div class="mt-6 flex items-center gap-6 border-b border-border">
		<nav class="min-w-0" aria-label="Type">
			<ul class="-mb-px flex gap-8" role="radiogroup">
				{#each types as option (option.value)}
					<li>
						<button
							type="button"
							role="radio"
							aria-checked={media.type === option.value}
							class={cn(
								"inline-flex h-12 cursor-pointer items-center border-b-2 text-sm font-bold tracking-wide uppercase transition-colors hover:text-foreground",
								media.type === option.value
									? "border-accent text-foreground"
									: "border-transparent text-dropdown-foreground",
							)}
							onclick={() => (media.type = option.value)}
						>
							{option.label}
						</button>
					</li>
				{/each}
			</ul>
		</nav>
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
			{media.refreshing ? "Refreshing" : "Refresh"}
		</Button>
	</div>

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
</main>
