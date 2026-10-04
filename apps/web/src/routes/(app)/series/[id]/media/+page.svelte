<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Tabs from "$lib/components/ui/Tabs.svelte";
	import { cn } from "$lib/utils";
	import { getSeries } from "$routes/(app)/series/[id]/series.remote";
	import {
		ArrowCounterClockwiseIcon,
		ArrowsClockwiseIcon,
		CaretLeftIcon,
		ResizeIcon,
	} from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import Filters from "./components/Filters.svelte";
	import Images from "./components/Images.svelte";
	import Sizing from "./components/Sizing.svelte";
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
</script>

<svelte:head>
	<title>Media · {series.title} · Sora</title>
</svelte:head>

<div
	class={cn(
		"bg-canvas px-5 pt-8 text-foreground sm:px-10 sm:pt-10 lg:px-16",
		arranging ? "flex h-page flex-col pb-8" : "min-h-page pb-16",
	)}
>
	<header class="flex items-center gap-2">
		<Button
			href="/series/{series.id}"
			variant="icon"
			size="lg"
			class="-ml-2"
			aria-label="Back to {series.title}"
		>
			<CaretLeftIcon size="1.5rem" weight="bold" />
		</Button>
		<h1 class="text-3xl font-bold">Media</h1>
	</header>

	<Tabs
		items={types}
		bind:value={
			() => media.type,
			(type) => {
				sizing = false;
				media.type = type;
			}
		}
		label="Image type"
		class="mt-6"
		panelClass={arranging ? "flex min-h-0 flex-1 flex-col" : undefined}
	>
		{#snippet actions()}
			<Button
				variant="ghost"
				class="ml-auto"
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
		{/snippet}

		{#snippet children()}
			{#if arranging}
				<section class="flex min-h-0 flex-1 flex-col" aria-label="Logo size and position">
					<div class="mt-4 flex items-center justify-between gap-4">
						<Button variant="ghost" onclick={() => (sizing = false)}>
							<CaretLeftIcon size="1rem" weight="bold" />
							All logos
						</Button>
						<Button
							variant="ghost"
							disabled={!placed}
							onclick={() =>
								media.place(series.id, {
									scale: 1,
									x: 0,
									y: 0,
								})}
						>
							<ArrowCounterClockwiseIcon size="1rem" weight="bold" />
							Reset
						</Button>
					</div>

					{#if media.error}
						<p class="mt-4 text-sm text-status-error" role="alert">{media.error}</p>
					{/if}

					<div class="@container-size mt-4 min-h-0 flex-1">
						<svelte:boundary>
							{#snippet pending()}
								<Skeleton class="mx-auto aspect-video w-[min(100cqw,calc(100cqh*16/9))]" />
							{/snippet}

							<Sizing {series} {media} />
						</svelte:boundary>
					</div>
				</section>
			{:else}
				<div class="mt-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
					<aside
						class="-mx-2 grid content-start gap-6 lg:sticky lg:top-22 lg:max-h-[calc(100dvh-7rem)] lg:scrollbar-thin lg:self-start lg:overflow-y-auto"
					>
						{#if media.type === "logo" && series.logo_url}
							<Button variant="ghost" class="justify-self-start" onclick={() => (sizing = true)}>
								<ResizeIcon size="1rem" weight="bold" />
								Size and position
							</Button>
						{/if}

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
									class={cn(
										"grid gap-x-5 gap-y-6",
										media.type === "poster"
											? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
											: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
									)}
									aria-busy="true"
									aria-label="Loading images"
								>
									{#each { length: 12 }, index (index)}
										<li>
											<Skeleton class={media.type === "poster" ? "aspect-2/3" : "aspect-video"} />
											<Skeleton class="mt-2.5 h-3 w-1/2" />
										</li>
									{/each}
								</ul>
							{/snippet}

							<Images {series} {media} />
						</svelte:boundary>
					</section>
				</div>
			{/if}
		{/snippet}
	</Tabs>
</div>
