<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import type { EpisodeProgress, SeasonEpisode } from "@sora/sdk";
	import { CalendarBlankIcon, DotsThreeVerticalIcon, PlayIcon } from "phosphor-svelte";

	import { markAllWatched } from "../series.remote";

	let {
		seriesId,
		seasonId,
		title,
		backdrop,
		episode,
		checkpoint,
	}: {
		seriesId: string;
		seasonId: string;
		title: string;
		backdrop: string | null;
		episode: SeasonEpisode;
		checkpoint: EpisodeProgress | undefined;
	} = $props();

	const watched = $derived(!!checkpoint?.watched);
	const played = $derived(
		checkpoint && !checkpoint.watched && checkpoint.position_seconds > 0
			? checkpoint.position_seconds / checkpoint.duration_seconds
			: 0,
	);
	const playable = $derived(!episode.extra && episode.audio?.length !== 0);
	const heading = $derived(`E${episode.number}${episode.title ? ` – ${episode.title}` : ""}`);
	const audio = $derived(audioLabel(episode.audio));
	const released = $derived(
		episode.aired_at
			? new Date(episode.aired_at).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				})
			: episode.air_date
				? new Date(episode.air_date).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
						timeZone: "UTC",
					})
				: null,
	);
	const image = $derived(episode.still_url ?? backdrop);
</script>

<li class="group relative isolate flex min-h-56 min-w-0 flex-col focus-within:z-10 hover:z-10">
	<svelte:element
		this={playable ? "a" : "div"}
		href={playable ? `/series/${seriesId}/watch/${seasonId}/${episode.number}` : undefined}
		class="flex min-w-0 flex-1 flex-col focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
	>
		<div
			class="flex flex-1 flex-col transition-opacity duration-150 group-hover:opacity-0 group-has-focus-visible:opacity-0"
		>
			<div class="relative aspect-video overflow-hidden bg-surface">
				{#if image}
					<Image
						src={tmdbImage(image, "w780")}
						srcset={tmdbSrcset(image, { w342: 342, w780: 780 })}
						alt=""
						class={cn("brightness-75", watched && "opacity-60")}
					/>
				{/if}
				{#if watched || episode.runtime_minutes}
					<span
						class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white"
					>
						{watched ? "Watched" : `${episode.runtime_minutes}m`}
					</span>
				{/if}
				{#if played}
					<span class="absolute inset-x-0 bottom-0 h-1 bg-black/60">
						<span class="block h-full bg-accent" style:width="{played * 100}%"></span>
					</span>
				{/if}
			</div>

			<p class="mt-3.5 line-clamp-1 text-[0.625rem] font-semibold text-subtle uppercase">{title}</p>
			<h3 class="mt-1.5 pr-8 text-[0.9375rem] leading-snug font-bold text-foreground">{heading}</h3>
			<p class="mt-2 text-sm text-muted">
				{[audio, episode.filler && "Filler", episode.extra && "Extra"]
					.filter((part) => !!part)
					.join(" · ")}
			</p>
		</div>

		<div
			class="pointer-events-none absolute -inset-2 z-10 flex flex-col bg-surface px-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100"
		>
			<p class="line-clamp-1 text-[0.625rem] font-semibold text-subtle uppercase">{title}</p>
			<h3 class="mt-2 text-[0.9375rem] leading-snug font-bold text-foreground">{heading}</h3>
			{#if released}
				<p class="mt-1 flex items-center gap-1.5 text-sm text-muted">
					<CalendarBlankIcon size="1rem" />
					{released}
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
					{watched ? "Watch again" : played ? "Resume" : "Play"} E{episode.number}
				</span>
			{/if}
		</div>
	</svelte:element>

	<div
		class="absolute -right-2 -bottom-2 z-20 [&_.dropdown-trigger]:bg-transparent! [&_.dropdown-trigger]:hover:text-white"
	>
		<Dropdown label="Episode options" class="w-48 *:p-0">
			{#snippet trigger()}
				<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
			{/snippet}
			{#snippet children()}
				<div role="menu" aria-label="Episode options">
					<Button
						role="menuitem"
						class="flex w-full items-center justify-start gap-3 px-5 py-3 text-left text-sm font-normal whitespace-nowrap text-muted focus:bg-panel-hover focus:text-foreground focus:outline-none"
						onclick={() =>
							markAllWatched({
								seriesId,
								seasonId,
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
