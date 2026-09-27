<script lang="ts">
	import {
		ArrowCounterClockwiseIcon,
		BookmarkSimpleIcon,
		CheckIcon,
		DotsThreeVerticalIcon,
		ImageIcon,
		PlayIcon,
		ProhibitIcon,
		TrashIcon,
	} from 'phosphor-svelte';
	import type { ContinueWatchingItem, LibraryTitle, Season, Series } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import { cn, tmdbImage } from '$lib/utils';
	import { getListed, setListed } from '$lib/watchlist.remote';
	import { clearProgress, markAllWatched, setDropped } from '../series.remote';

	let {
		series,
		season,
		resume,
		library,
		seasonWatched,
	}: {
		series: Series;
		season: Season;
		resume: ContinueWatchingItem | null;
		library: LibraryTitle;
		seasonWatched: boolean;
	} = $props();

	const listing = getListed();
	const listed = $derived(listing.current?.includes(series.id) ?? library.listed);

	const play = $derived.by(() => {
		if (resume) {
			const where = series.seasons.find((other) => other.id === resume.season_id);
			return {
				href: `/series/${series.id}/watch/${resume.season_id}/${resume.episode}`,
				label: `${resume.position_seconds > 0 ? 'Continue' : 'Start'} ${series.seasons.length > 1 && where ? `${where.title} ` : ''}E${resume.episode}`,
			};
		}

		const first = series.seasons.find((other) => other.in_watch_order) ?? series.seasons[0];
		return (
			first && {
				href: `/series/${series.id}/watch/${first.id}/1`,
				label: library.status === 'completed' ? 'Watch again' : series.kind === 'movie' ? 'Play' : 'Start watching E1',
			}
		);
	});

	const standing = $derived.by(() => {
		const {
			status,
			current_season,
			new_season,
		} = library;

		if (status === 'dropped') {
			return 'Dropped';
		}

		if (status === 'completed') {
			return new_season ? `Watched · ${new_season.title} is out` : 'Watched';
		}

		if (status === 'watching' && current_season) {
			return [
				'Watching',
				series.seasons.length > 1 && current_season.title,
				`${current_season.watched_episodes} of ${current_season.released_episodes} episodes`,
			]
				.filter((part) => !!part)
				.join(' · ');
		}

		return null;
	});

	const next = $derived.by(() => {
		if (!series.next_episode) {
			return null;
		}

		const airing = new Date(series.next_episode.airing_at);
		if (airing <= new Date()) {
			return null;
		}

		return `Episode ${series.next_episode.number} airs ${airing.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
		})} at ${airing.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
		})}`;
	});

	const item =
		'flex w-full items-center justify-start gap-3 px-5 py-3 text-left text-sm font-normal whitespace-nowrap text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none';
</script>

<section>
	<figure
		class="series-hero relative z-30 grid h-[calc(100dvh-10rem)] max-h-192 min-h-120 grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:z-10 before:col-start-1 before:row-start-1 before:h-full after:pointer-events-none after:z-10 after:col-start-1 after:row-start-1 after:h-full sm:min-h-150 lg:max-h-300 lg:min-h-175"
	>
		<h1 class="sr-only">{series.title}</h1>

		{#if series.backdrop_url}
			<div class="absolute inset-0 overflow-hidden">
				<ProgressiveImage
					src={series.backdrop_url}
					alt=""
					class="absolute inset-x-0 top-0 z-0 h-dvh w-full"
					imageClass="object-[45%_0%]"
					displaySize="original"
					loading="eager"
					fetchpriority="high"
				/>
			</div>
		{/if}

		<div
			class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end leading-none font-bold sm:mt-5 sm:mr-8 lg:mr-12 [&_.dropdown-trigger]:gap-1 [&_.dropdown-trigger]:text-white"
		>
			<Dropdown id="series-actions" className="w-64 *:p-0">
				{#snippet trigger()}
					<DotsThreeVerticalIcon size="1.5rem" weight="bold" />
					<span>More</span>
				{/snippet}
				{#snippet children()}
					<div role="menu" aria-label="More">
						<Button
							role="menuitem"
							class={item}
							popovertarget="series-actions"
							popovertargetaction="hide"
							onclick={() =>
								markAllWatched({
									seriesId: series.id,
									seasonId: season.id,
									watched: !seasonWatched,
								})}
						>
							<CheckIcon size="1.1rem" />
							{series.seasons.length > 1
								? `Mark ${season.title} as ${seasonWatched ? 'unwatched' : 'watched'}`
								: `Mark as ${seasonWatched ? 'unwatched' : 'watched'}`}
						</Button>

						{#if series.seasons.length > 1}
							<Button
								role="menuitem"
								class={item}
								popovertarget="series-actions"
								popovertargetaction="hide"
								onclick={() =>
									markAllWatched({
										seriesId: series.id,
										watched: true,
									})}
							>
								<CheckIcon size="1.1rem" />
								Mark all as watched
							</Button>
						{/if}

						<Button
							role="menuitem"
							class={item}
							popovertarget="series-actions"
							popovertargetaction="hide"
							onclick={() =>
								setDropped({
									seriesId: series.id,
									dropped: library.status !== 'dropped',
								})}
						>
							{#if library.status === 'dropped'}
								<ArrowCounterClockwiseIcon size="1.1rem" />
								Undo drop
							{:else}
								<ProhibitIcon size="1.1rem" />
								Drop
							{/if}
						</Button>

						{#if library.last_watched_at}
							<Button
								role="menuitem"
								class={item}
								popovertarget="series-actions"
								popovertargetaction="hide"
								onclick={() => clearProgress(series.id)}
							>
								<TrashIcon size="1.1rem" />
								Clear progress
							</Button>
						{/if}

						<a role="menuitem" href="/series/{series.id}/artwork" class={item}>
							<ImageIcon size="1.1rem" />
							Edit artwork
						</a>
					</div>
				{/snippet}
			</Dropdown>
		</div>

		<div class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-20">
			<div class="w-fit">
				{#if series.logo_url}
					<img
						src={tmdbImage(series.logo_url, 'w500')}
						alt=""
						aria-hidden="true"
						class="h-[clamp(5rem,6.4vw,8rem)] max-w-[65vw] object-contain object-left sm:max-w-md lg:max-w-lg 2xl:max-w-2xl"
					/>
				{:else}
					<p aria-hidden="true" class="max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
						{series.title}
					</p>
				{/if}
			</div>

			{#if next}
				<p class="mt-7 text-base font-semibold text-foreground/80 sm:mt-8 sm:text-lg">{next}</p>
			{/if}

			<p class={cn('flex flex-wrap items-center gap-y-1 text-sm text-muted lg:text-base', next ? 'mt-3' : 'mt-8 sm:mt-10 lg:mt-11')}>
				{#if series.audio.length}
					<span class="metadata-tag">
						{[series.audio.includes('sub') && 'Sub', series.audio.includes('dub') && 'Dub']
							.filter((label) => !!label)
							.join(' | ')}
					</span>
				{/if}
				{#if series.genres.length}
					<span class="metadata-tag">{series.genres.join(', ')}</span>
				{/if}
				{#if standing}
					<span class="metadata-tag text-foreground">{standing}</span>
				{/if}
			</p>

			{#if series.score !== null}
				<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:text-base lg:mt-3.5 lg:gap-2.5">
					<span class="flex items-center gap-0.5 text-subtle" aria-hidden="true">
						{#each { length: 5 }, index (index)}
							<svg
								class={cn('size-6 shrink-0 fill-current sm:size-7', index < Math.round(series.score / 20) && 'text-foreground')}
								viewBox="0 0 24 24"
							>
								<path d="m12 2 2.85 6.59L22 9.27 16.55 14l1.63 7L12 17.27 5.82 21l1.63-7L2 9.27l7.15-.68z"></path>
							</svg>
						{/each}
					</span>
					<span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>
					<strong>Average rating: {(series.score / 20).toFixed(1)} of 5</strong>
				</div>
			{/if}

			<div class="mt-7 flex items-center gap-2 text-xs font-bold text-accent max-sm:flex-wrap sm:text-sm lg:mt-8 lg:gap-2.5">
				{#if play}
					<a
						href={play.href}
						class="flex h-10 items-center gap-2.5 bg-accent px-4 text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] sm:px-6"
					>
						<PlayIcon size="1.55em" weight="bold" />
						{play.label}
					</a>
				{/if}

				<Tooltip text={listed ? 'Remove from Watchlist' : 'Add to Watchlist'}>
					<button
						type="button"
						class="grid size-10 cursor-pointer place-items-center border-2 border-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-90"
						aria-label={listed ? 'Remove from Watchlist' : 'Add to Watchlist'}
						aria-pressed={listed}
						onclick={() =>
							setListed({
								seriesId: series.id,
								listed: !listed,
							}).updates(
								listing.withOverride((ids) => (listed ? ids.filter((id) => id !== series.id) : [...ids, series.id]))
							)}
					>
						<BookmarkSimpleIcon size="1.65em" weight={listed ? 'fill' : 'bold'} />
					</button>
				</Tooltip>
			</div>
		</div>
	</figure>
</section>
