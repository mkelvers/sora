<script lang="ts">
	import type { Season } from '@sora/sdk';

	type Props = {
		seasons: Season[];
		season: Season;
	};

	let { seasons, season = $bindable() }: Props = $props();
</script>

<div role="tablist" aria-label="Seasons">
	{#each seasons as other (other.id)}
		<button role="tab" aria-selected={other.id === season.id} onclick={() => (season = other)}>
			{other.title}
		</button>
	{/each}
</div>

<style>
	div {
		display: flex;
		gap: 4px;
		margin-bottom: 24px;
		overflow: auto hidden;
		border-bottom: 1px solid #2a2a2a;
		scrollbar-width: none;
	}

	div::-webkit-scrollbar {
		display: none;
	}

	button {
		flex: none;
		padding: 10px 14px;
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		color: #999;
		font: inherit;
		font-size: 15px;
		cursor: pointer;
		transition:
			color 120ms,
			border-color 120ms;
	}

	button:hover {
		color: #fff;
	}

	button[aria-selected='true'] {
		border-bottom-color: #fff;
		color: #fff;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
</style>
