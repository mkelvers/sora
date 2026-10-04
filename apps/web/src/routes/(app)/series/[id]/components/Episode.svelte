<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import { audioLabel, cn, formatDuration, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { markEpisode } from "$routes/(app)/series/[id]/series.remote";
	import type { Episode, Progress } from "@sora/sdk";
	import { CalendarBlankIcon, DotsThreeVerticalIcon, PlayIcon } from "phosphor-svelte";

	let {
		seriesId,
		title,
		movie,
		backdrop,
		episode,
		progress,
	}: {
		seriesId: string;
		title: string;
		movie: boolean;
		backdrop: string | null;
		episode: Episode;
		progress?: Progress;
	} = $props();

	const watched = $derived(!!progress?.finished);

	const played = $derived(
		progress && !watched && !progress.finished && progress.position_seconds > 0
			? progress.position_seconds / progress.duration_seconds
			: 0,
	);
	const playable = $derived(episode.audio?.length !== 0);
	const heading = $derived(
		movie
			? (episode.title ?? title)
			: `E${episode.number}${episode.title ? ` – ${episode.title}` : ""}`,
	);
	const label = $derived(movie ? "" : ` E${episode.number}`);
	const audio = $derived(audioLabel(episode.audio));
	const released = $derived.by(() => {
		if (episode.aired_at) {
			return {
				iso: episode.aired_at,
				label: new Date(episode.aired_at).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				}),
			};
		}

		if (episode.air_date) {
			return {
				iso: episode.air_date,
				label: new Date(episode.air_date).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
					timeZone: "UTC",
				}),
			};
		}

		return null;
	});
	const image = $derived(episode.still_url ?? backdrop);
</script>

<li class="group relative isolate flex min-w-0 flex-col focus-within:z-10 hover:z-10 sm:min-h-56">
	<svelte:element
		this={playable ? "a" : "div"}
		href={playable ? `/series/${seriesId}/watch/${episode.number}` : undefined}
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
						alt="Still from episode {episode.number} of {title}"
						class={cn("brightness-75", watched && "opacity-60")}
					/>
				{/if}
				{#if episode.filler}
					<span
						class="absolute top-0 right-0 size-7 after:absolute after:inset-0 after:bg-yellow-400 after:[clip-path:polygon(0_0,100%_0,100%_100%)]"
					>
						<span class="sr-only">Filler episode</span>
					</span>
				{/if}
				{#if watched || played || episode.runtime_minutes}
					<span
						class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white"
					>
						{#if watched}
							Watched
						{:else if progress && played}
							{formatDuration(
								Math.max(1, (progress.duration_seconds - progress.position_seconds) / 60),
							)} left
						{:else if episode.runtime_minutes}
							{formatDuration(episode.runtime_minutes)}
						{/if}
					</span>
				{/if}
				{#if played}
					<progress
						class="absolute inset-x-0 bottom-0 block h-1 w-full appearance-none bg-black/60 [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-black/60 [&::-webkit-progress-value]:bg-accent"
						value={played}
						aria-label="{Math.round(played * 100)}% watched"
					></progress>
				{/if}
			</div>

			<p class="line-clamp-1 text-[0.625rem] font-semibold text-subtle uppercase sm:mt-3.5">
				{title}
			</p>
			<h3 class="mt-1 pr-8 text-[0.9375rem] leading-snug font-bold text-foreground sm:mt-1.5">
				{heading}
			</h3>
			<p class="mt-1 pr-8 text-sm text-muted sm:mt-2 sm:pr-0">
				{audio}
			</p>
		</div>

		<div
			aria-hidden="true"
			class="pointer-events-none absolute -inset-2 z-10 flex flex-col bg-surface px-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100 max-sm:hidden"
		>
			<p class="line-clamp-1 text-[0.625rem] font-semibold text-subtle uppercase">{title}</p>
			<p class="mt-2 text-[0.9375rem] leading-snug font-bold text-foreground">{heading}</p>
			{#if released}
				<p class="mt-1 flex items-center gap-1.5 text-sm text-muted">
					<CalendarBlankIcon size="1rem" />
					<time datetime={released.iso}>{released.label}</time>
				</p>
			{/if}
			{#if episode.overview}
				<p class="mt-2 line-clamp-5 text-[0.8125rem] leading-snug text-foreground">
					{episode.overview}
				</p>
			{/if}
			{#if playable}
				<span
					class="mt-auto flex h-10 shrink-0 items-center gap-2 text-sm font-bold text-accent uppercase"
				>
					<PlayIcon size="1.25rem" weight="bold" />
					{#if watched}
						Watch again{label}
					{:else if played}
						Resume{label}
					{:else}
						Play{label}
					{/if}
				</span>
			{/if}
		</div>
	</svelte:element>

	<div
		class="absolute -right-2 -bottom-2 z-20 [&_.dropdown-trigger]:bg-transparent! [&_.dropdown-trigger]:hover:text-white"
	>
		<Dropdown label="Episode options" class="w-48">
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
								seriesId,
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
