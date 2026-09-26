<script lang="ts" module>
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { SeriesImage } from '@sora/sdk';

	export { imagesSkeleton };
</script>

{#snippet imagesSkeleton(type: SeriesImage['type'])}
	<ul class:poster={type === 'poster'} aria-busy="true" aria-label="Loading images">
		{#each { length: 12 }, index (index)}
			<li>
				<Skeleton width="100%" ratio={type === 'poster' ? '2 / 3' : '16 / 9'} />
				<Skeleton variant="text" width="50%" />
				<Skeleton variant="text" width="70%" />
			</li>
		{/each}
	</ul>
{/snippet}

<style>
	ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 28px 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	ul.poster {
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	li {
		display: grid;
		justify-items: center;
		gap: 10px;
	}

	@media (max-width: 720px) {
		ul {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 20px 12px;
		}

		ul.poster {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}
</style>
