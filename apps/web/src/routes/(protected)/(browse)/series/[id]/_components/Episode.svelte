<script lang="ts">
	import { CalendarBlankIcon, PlayIcon } from 'phosphor-svelte';
	import type { EpisodeProgress, SeasonEpisode } from '@sora/sdk';
	import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
	import { cn } from '$lib/utils';

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

	const watched = $derived(!!checkpoint?.completed);
	const played = $derived(
		checkpoint && !checkpoint.completed && checkpoint.position_seconds > 0
			? checkpoint.position_seconds / checkpoint.duration_seconds
			: 0
	);
	const playable = $derived(!episode.extra && episode.audio?.length !== 0);
	const heading = $derived(`E${episode.number}${episode.title ? ` – ${episode.title}` : ''}`);
	const audio = $derived(audioLabel(episode.audio));
	const released = $derived(
		episode.aired_at
			? new Date(episode.aired_at).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
				})
			: episode.air_date
				? new Date(episode.air_date).toLocaleDateString('en-US', {
						month: 'short',
						day: 'numeric',
						year: 'numeric',
						timeZone: 'UTC',
					})
				: null
	);
	const image = $derived(episode.still_url ?? backdrop);
</script>

<li class="group relative flex min-h-56 min-w-0 flex-col [content-visibility:auto] [contain-intrinsic-size:auto_18rem]">
	<svelte:element
		this={playable ? 'a' : 'div'}
		href={playable ? `/series/${seriesId}/watch/${seasonId}/${episode.number}` : undefined}
		class="flex min-w-0 flex-1 flex-col focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
	>
		<div class="flex flex-1 flex-col transition-opacity duration-150 group-hover:opacity-0 group-has-focus-visible:opacity-0">
			<div class="relative aspect-video overflow-hidden bg-surface">
				{#if image}
					<ProgressiveImage src={image} alt="" displaySize="w780" imageClass={cn('brightness-75', watched && 'opacity-60')} />
				{/if}
				{#if episode.runtime_minutes}
					<span class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white">
						{episode.runtime_minutes}m
					</span>
				{/if}
				{#if watched}
					<span class="absolute top-2 left-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white uppercase">Watched</span>
				{/if}
				{#if played}
					<span class="absolute inset-x-0 bottom-0 h-1 bg-black/60">
						<span class="block h-full bg-accent" style:width="{played * 100}%"></span>
					</span>
				{/if}
			</div>

			<p class="mt-3.5 line-clamp-1 text-[0.625rem] font-semibold text-subtle uppercase">{title}</p>
			<h3 class="mt-1.5 text-[0.9375rem] leading-snug font-bold text-foreground">{heading}</h3>
			<p class="mt-2 text-sm text-muted">
				{[audio, episode.filler && 'Filler', episode.extra && 'Extra'].filter((part) => !!part).join(' · ')}
			</p>
		</div>

		<div
			class="pointer-events-none absolute inset-0 z-10 flex flex-col bg-surface px-4 pt-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100"
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
				<p class="mt-2 line-clamp-4 text-sm leading-snug text-foreground">{episode.overview}</p>
			{/if}
			{#if playable}
				<span class="mt-auto flex h-10 shrink-0 items-center gap-2 text-sm font-bold text-accent uppercase">
					<PlayIcon size="1.25rem" weight="bold" />
					{played ? 'Resume' : 'Play'} E{episode.number}
				</span>
			{/if}
		</div>
	</svelte:element>
</li>
