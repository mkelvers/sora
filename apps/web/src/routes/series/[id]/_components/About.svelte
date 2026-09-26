<script lang="ts">
	import type { Series } from '@sora/sdk';
	import { formatDay, formatTime } from '$lib/utils';

	type Props = {
		series: Series;
	};

	let { series }: Props = $props();

	let overview = $state<HTMLElement>();
	let open = $state(false);
	/** Whether the clamped overview hides anything, so "More" has something to show. */
	let clamped = $state(false);

	$effect(() => {
		void series.overview;
		if (overview && !open) {
			clamped = overview.scrollHeight > overview.clientHeight + 1;
		}
	});

	const tags = $derived(
		series.tags
			.filter((tag) => !tag.spoiler && (tag.rank ?? 0) >= 60)
			.slice(0, 6)
			.map((tag) => tag.name)
	);

	const next = $derived(series.next_episode ? new Date(series.next_episode.airing_at) : undefined);
</script>

<svelte:window onresize={() => overview && !open && (clamped = overview.scrollHeight > overview.clientHeight + 1)} />

<section>
	<div class="overview">
		{#if series.overview}
			<p bind:this={overview} class:open>{series.overview}</p>
			{#if clamped || open}
				<button onclick={() => (open = !open)} aria-expanded={open}>
					{open ? 'Less' : 'More'}
				</button>
			{/if}
		{:else}
			<p class="none">No synopsis yet.</p>
		{/if}
	</div>

	<dl>
		{#if next && series.next_episode}
			<div>
				<dt>Next episode</dt>
				<dd class="next">Episode {series.next_episode.number} · {formatDay(next)}, {formatTime(next)}</dd>
			</div>
		{/if}
		{#if series.studios.length > 0}
			<div>
				<dt>{series.studios.length > 1 ? 'Studios' : 'Studio'}</dt>
				<dd>{series.studios.join(', ')}</dd>
			</div>
		{/if}
		{#if series.genres.length > 0}
			<div>
				<dt>Genres</dt>
				<dd>{series.genres.join(', ')}</dd>
			</div>
		{/if}
		{#if tags.length > 0}
			<div>
				<dt>Themes</dt>
				<dd>{tags.join(', ')}</dd>
			</div>
		{/if}
	</dl>
</section>

<style>
	section {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 32px clamp(32px, 6vw, 96px);
		padding: 0 var(--gutter);
	}

	p {
		display: -webkit-box;
		max-width: 72ch;
		margin: 0;
		overflow: hidden;
		color: var(--text-2);
		font-size: 15px;
		line-height: 1.7;
		white-space: pre-line;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}

	p.open {
		display: block;
	}

	.none {
		color: var(--text-3);
	}

	button {
		margin-top: 12px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	button:hover {
		color: var(--accent);
	}

	button:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: 4px;
	}

	dl {
		display: grid;
		gap: 14px;
		margin: 0;
		align-content: start;
		font-size: 14px;
		line-height: 1.5;
	}

	dl div {
		display: grid;
		grid-template-columns: 112px minmax(0, 1fr);
		gap: 16px;
	}

	dt {
		color: var(--text-3);
	}

	dd {
		margin: 0;
		color: var(--text-2);
	}

	.next {
		color: var(--accent);
	}

	@media (max-width: 800px) {
		section {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
