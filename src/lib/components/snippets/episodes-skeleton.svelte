<script lang="ts" module>
	export { episodesSkeleton };
</script>

{#snippet episodesSkeleton(count: number)}
	<ol aria-busy="true" aria-label="Loading episodes">
		{#each { length: Math.min(count, 6) }, index (index)}
			<li>
				<div class="still"></div>
				<div class="text">
					<div style:width="45%"></div>
					<div style:width="12%"></div>
					<div style:width="90%"></div>
					<div style:width="75%"></div>
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
		grid-template-columns: minmax(160px, 375px) minmax(0, 1fr) 40px;
		align-items: center;
		gap: 24px;
		padding: 4px 0;
	}

	.still,
	.text div {
		background: linear-gradient(90deg, #1f1f1f 0%, #2c2c2c 50%, #1f1f1f 100%);
		background-size: 200% 100%;
		animation: shimmer 1.2s linear infinite;
	}

	.still {
		aspect-ratio: 3 / 2;
	}

	.text {
		display: grid;
		gap: 10px;
		max-width: 70ch;
	}

	.text div {
		height: 12px;
	}

	@keyframes shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.still,
		.text div {
			animation: none;
		}
	}

	@media (max-width: 720px) {
		li {
			grid-template-columns: 140px minmax(0, 1fr);
			gap: 12px;
		}
	}
</style>
