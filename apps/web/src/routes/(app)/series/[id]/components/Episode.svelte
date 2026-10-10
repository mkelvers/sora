<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { markEpisode } from "$routes/(app)/series/[id]/series.remote";
	import type { Episode, Progress, Series } from "@sora/sdk";
	import { CalendarBlankIcon, DotsThreeVerticalIcon, PlayIcon } from "phosphor-svelte";

	let {
		series,
		episode,
		progress,
		options,
		onoptions,
	}: {
		series: Series;
		episode: Episode;
		progress?: Progress;
		options: boolean;
		onoptions: () => void;
	} = $props();

	function duration(minutes: number) {
		const total = Math.round(minutes);
		const hours = Math.floor(total / 60);
		const rest = total % 60;

		return hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
	}

	const id = $props.id();
	const movie = $derived(series.format === "MOVIE");
	const watched = $derived(!!progress?.finished);
	const started = $derived(progress && !watched && progress.position_seconds > 0 ? progress : null);
	const played = $derived(started ? started.position_seconds / started.duration_seconds : 0);
	const playable = $derived(episode.audio?.length !== 0);
	const heading = $derived(
		movie
			? (episode.title ?? series.title)
			: `E${episode.number}${episode.title ? ` – ${episode.title}` : ""}`,
	);
	const badge = $derived(
		watched
			? "Watched"
			: started
				? `${duration(Math.max(1, (started.duration_seconds - started.position_seconds) / 60))} left`
				: episode.runtime_minutes && duration(episode.runtime_minutes),
	);
	const action = $derived(
		`${watched ? "Watch again" : started ? "Resume" : "Play"}${movie ? "" : ` E${episode.number}`}`,
	);
	const released = $derived(episode.aired_at ?? episode.air_date);
	const image = $derived(episode.still_url ?? series.backdrop_url);
</script>

<li class="group relative isolate flex min-w-0 flex-col focus-within:z-10 hover:z-10 sm:min-h-56">
	<svelte:element
		this={playable ? "a" : "div"}
		href={playable ? `/series/${series.id}/watch/${episode.number}` : undefined}
		aria-labelledby={playable ? `${id}-title` : undefined}
		aria-describedby={playable ? `${id}-filler ${id}-badge ${id}-audio` : undefined}
		class="flex min-w-0 flex-1 flex-col focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
	>
		<div
			class="grid flex-1 grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 transition-opacity duration-150 sm:flex sm:flex-col sm:group-hover:opacity-0 sm:group-has-focus-visible:opacity-0"
		>
			<div class="relative row-span-3 aspect-video w-full self-start overflow-hidden bg-surface">
				{#if image}
					<Image
						src={tmdbImage(image, "w780")}
						srcset={tmdbSrcset(image, {
							w500: 500,
							w780: 780,
						})}
						sizes="(min-width: 120rem) 14vw, (min-width: 96rem) 16vw, (min-width: 90rem) 20vw, (min-width: 64rem) 25vw, (min-width: 48rem) 33vw, (min-width: 40rem) 50vw, 40vw"
						alt="Still from episode {episode.number} of {series.title}"
						aria-hidden="true"
						class={cn("brightness-75", watched && "opacity-60")}
					/>
				{/if}
				{#if episode.filler}
					<span
						class="absolute top-0 right-0 size-7 after:absolute after:inset-0 after:bg-yellow-400 after:[clip-path:polygon(0_0,100%_0,100%_100%)]"
					>
						<span id="{id}-filler" class="sr-only">Filler Episode</span>
					</span>
				{/if}
				{#if badge}
					<span
						id="{id}-badge"
						class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white"
					>
						{badge}
					</span>
				{/if}
				{#if started}
					<progress
						class="absolute inset-x-0 bottom-0 z-10 block h-1 w-full appearance-none bg-black/60 [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-black/60 [&::-webkit-progress-value]:bg-accent"
						value={played}
						aria-label="{Math.round(played * 100)}% watched"
					>
						{Math.round(played * 100)}%
					</progress>
				{/if}
			</div>

			<h3 id="{id}-title" class="pr-8 text-sm leading-snug font-semibold text-foreground sm:mt-3">
				{heading}
			</h3>
			<p id="{id}-audio" class="mt-1 pr-8 text-sm text-muted sm:mt-1.5 sm:pr-0">
				{audioLabel(episode.audio)}
			</p>
		</div>

		<div
			aria-hidden="true"
			class="pointer-events-none absolute -inset-2 z-10 flex flex-col bg-surface px-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100 max-sm:hidden"
		>
			<p class="text-sm leading-snug font-semibold text-foreground">{heading}</p>
			{#if released}
				<p class="mt-1 flex items-center gap-1.5 text-sm text-muted">
					<CalendarBlankIcon size="1rem" />
					<time datetime={released}>
						{new Date(released).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
							timeZone: episode.aired_at ? undefined : "UTC",
						})}
					</time>
				</p>
			{/if}
			{#if episode.overview}
				<p class="mt-2 line-clamp-5 text-sm leading-snug text-foreground">
					{episode.overview}
				</p>
			{/if}
			{#if playable}
				<span
					class="mt-auto flex h-10 shrink-0 items-center gap-2 text-sm font-bold text-accent uppercase"
				>
					<PlayIcon size="1.25rem" weight="bold" />
					{action}
				</span>
			{/if}
		</div>
	</svelte:element>

	<Button
		variant="icon"
		class="absolute -right-2 -bottom-2 z-20 sm:hidden"
		aria-label="Episode {episode.number} options"
		aria-haspopup="dialog"
		aria-controls="episode-options"
		aria-expanded={options}
		onclick={onoptions}
	>
		<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
	</Button>

	<div class="absolute -right-2 -bottom-2 z-20 max-sm:hidden">
		<Dropdown variant="icon" label="Episode options" class="w-48">
			{#snippet trigger()}
				<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
			{/snippet}
			{#snippet children()}
				<div role="menu" aria-label="Episode options">
					<Button
						role="menuitem"
						variant="item"
						onclick={() =>
							markEpisode({
								seriesId: series.id,
								episode: episode.number,
								watched: !watched,
							})}
					>
						Mark as {watched ? "Unwatched" : "Watched"}
					</Button>
				</div>
			{/snippet}
		</Dropdown>
	</div>
</li>
