<script lang="ts" module>
	import Skeleton from '$lib/components/Skeleton.svelte';

	export { episodesSkeleton };
</script>

{#snippet episodesSkeleton(count: number)}
	<ol aria-busy="true" aria-label="Loading episodes">
		{#each { length: Math.min(count, 6) }, index (index)}
			<li>
				<Skeleton ratio="3 / 2" />
				<div class="text">
					{#each ['45%', '12%', '90%', '75%'] as width, line (line)}
						<Skeleton variant="text" {width} />
					{/each}
				</div>
			</li>
		{/each}
	</ol>
{/snippet}

<style>
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: minmax(160px, 375px) minmax(0, 1fr);
		align-items: center;
		gap: 24px;
		padding: 10px 0;
	}

	.text {
		display: grid;
		gap: 10px;
		max-width: 70ch;
	}
</style>
