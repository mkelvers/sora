<script lang="ts">
	import type { Series } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn } from '$lib/utils';
	import Rating from './Rating.svelte';

	let {
		series,
	}: {
		series: Series;
	} = $props();

	let expanded = $state(false);

	const original = $derived(
		series.original_language
			? new Intl.DisplayNames(['en'], {
					type: 'language',
				}).of(series.original_language)
			: undefined
	);
	const audio = $derived(
		[(series.audio.includes('sub') || series.audio.includes('raw')) && original, series.audio.includes('dub') && 'English']
			.filter((language) => !!language)
			.join(', ')
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
					{#if audio}
						<p>
							<strong class="font-normal text-foreground">Audio:</strong>
							{audio}
						</p>
					{/if}
					{#if series.audio.includes('sub')}
						<p>
							<strong class="font-normal text-foreground">Subtitles:</strong>
							English
						</p>
					{/if}
					{#if series.content_rating}
						<p>
							<strong class="font-normal text-foreground">Content advisory:</strong>
							<Rating rating={series.content_rating} />
						</p>
					{/if}
					{#if series.genres.length}
						<p>
							<strong class="font-normal text-foreground">Genres:</strong>
							{series.genres.join(', ')}
						</p>
					{/if}
					{#if series.studios.length}
						<p class="text-xs font-semibold text-foreground">Animation by {series.studios.join(', ')}</p>
					{/if}
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
