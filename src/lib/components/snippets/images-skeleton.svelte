<script lang="ts" module>
	import type { SeriesImage } from '@sora/sdk';

	export { imagesSkeleton };
</script>

{#snippet imagesSkeleton(type: SeriesImage['type'])}
	<div class="grid" class:poster={type === 'poster'} aria-busy="true" aria-label="Loading images">
		{#each { length: 12 }, index (index)}
			<div class="image"></div>
		{/each}
	</div>
{/snippet}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 24px;
		margin-top: 56px;
	}

	.grid.poster {
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}

	.image {
		aspect-ratio: 16 / 9;
		background: #1c1c1c;
	}

	.poster .image {
		aspect-ratio: 2 / 3;
	}
</style>
