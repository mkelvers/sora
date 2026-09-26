<script lang="ts" module>
	import type { SeriesImage } from '@sora/sdk';

	export { imagesSkeleton };
</script>

{#snippet imagesSkeleton(type: SeriesImage['type'])}
	<div class="grid" class:poster={type === 'poster'} aria-busy="true" aria-label="Loading images">
		{#each { length: 12 }, index (index)}
			<div class="card">
				<div class="image"></div>
				<div class="line" style:width="50%"></div>
				<div class="line" style:width="70%"></div>
			</div>
		{/each}
	</div>
{/snippet}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 28px 16px;
	}

	.grid.poster {
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	.card {
		display: grid;
		justify-items: center;
		gap: 10px;
	}

	.image,
	.line {
		background: linear-gradient(90deg, #1f1f1f 0%, #2c2c2c 50%, #1f1f1f 100%);
		background-size: 200% 100%;
		animation: shimmer 1.2s linear infinite;
	}

	.image {
		width: 100%;
		aspect-ratio: 16 / 9;
	}

	.poster .image {
		aspect-ratio: 2 / 3;
	}

	.line {
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
		.image,
		.line {
			animation: none;
		}
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 20px 12px;
		}

		.grid.poster {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}
</style>
