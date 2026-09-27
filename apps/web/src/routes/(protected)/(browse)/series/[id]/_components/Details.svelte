<script lang="ts">
	import type { Series } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn } from '$lib/utils';

	let {
		series,
	}: {
		series: Series;
	} = $props();

	let expanded = $state(false);

	const statuses: Record<NonNullable<Series['status']>, string> = {
		FINISHED: 'Finished',
		RELEASING: 'Airing',
		NOT_YET_RELEASED: 'Upcoming',
		CANCELLED: 'Cancelled',
		HIATUS: 'On hiatus',
	};

	const rows = $derived(
		[
			{
				term: 'Production',
				value: series.studios.join(', '),
			},
			{
				term: 'Status',
				value: series.status ? statuses[series.status] : '',
			},
			{
				term: 'Released',
				value: series.start_date
					? series.start_date.length === 4
						? series.start_date
						: new Date(series.start_date).toLocaleDateString('en-US', {
								day: series.start_date.length === 10 ? 'numeric' : undefined,
								month: 'long',
								year: 'numeric',
								timeZone: 'UTC',
							})
					: '',
			},
			{
				term: 'Episodes',
				value:
					series.kind === 'movie' || series.episode_count === 0
						? ''
						: `${series.episode_count} across ${series.season_count} ${series.season_count === 1 ? 'season' : 'seasons'}`,
			},
			{
				term: 'Genres',
				value: series.genres.join(', '),
			},
			{
				term: 'Themes',
				value: series.tags
					.filter((tag) => !tag.spoiler && (tag.rank ?? 0) >= 60)
					.slice(0, 8)
					.map((tag) => tag.name)
					.join(', '),
			},
		].filter((row) => row.value)
	);
</script>

<div class="relative z-20 bg-canvas px-5 sm:px-10 lg:px-16">
	<div class="border-b border-border pt-7 lg:pt-8">
		<div
			class={cn(
				'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
				expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
			)}
		>
			<section
				id="series-details"
				inert={!expanded}
				class={cn(
					'grid min-h-24 max-w-432 min-w-0 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-2 md:gap-12 lg:gap-28 lg:text-sm lg:leading-6',
					!expanded && 'mask-[linear-gradient(to_bottom,black_45%,transparent_100%)]'
				)}
			>
				<p class="max-w-3xl text-foreground">{series.overview ?? ''}</p>
				<div class="space-y-3">
					{#each rows as row (row.term)}
						<p>
							<strong class="font-normal text-foreground">{row.term}:</strong>
							{row.value}
						</p>
					{/each}
				</div>
			</section>
		</div>

		<Button
			class="min-h-11 text-xs font-semibold text-accent uppercase"
			aria-expanded={expanded}
			aria-controls="series-details"
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? 'Fewer details' : 'More details'}
		</Button>
	</div>
</div>
