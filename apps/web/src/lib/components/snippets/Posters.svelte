<script lang="ts">
	import Poster from './Poster.svelte';
	import Skeleton from './Skeleton.svelte';
	import type { SeriesCard } from '@sora/sdk';

	type Props = {
		/** Skeleton cards stand in while this is undefined. */
		series: SeriesCard[] | undefined;
	};

	let { series }: Props = $props();
</script>

{#if series}
	<ul>
		{#each series as item (item.id)}
			<li>
				<Poster series={item} />
			</li>
		{/each}
	</ul>
{:else}
	<ul aria-busy="true" aria-label="Loading">
		{#each { length: 12 }, index (index)}
			<li>
				<Skeleton ratio="2 / 3" />
				<Skeleton variant="text" width="70%" style="margin-top: 8px" />
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		--gap: 24px;
		display: grid;
		/* At least 200px a card, and never more than six to a row. */
		grid-template-columns: repeat(auto-fill, minmax(max(200px, (100% - 5 * var(--gap)) / 6), 1fr));
		gap: 32px var(--gap);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		min-width: 0;
	}
</style>
