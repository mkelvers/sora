<script lang="ts">
	import type { Season } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';

	type Props = {
		seasons: Season[];
		season: Season;
	};

	let { seasons, season = $bindable() }: Props = $props();
</script>

<div role="tablist" aria-label="Seasons">
	{#each seasons as other (other.id)}
		<Button class="tab" role="tab" aria-selected={other.id === season.id} onclick={() => (season = other)}>
			{other.title}
		</Button>
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

	div :global(.tab) {
		padding: 10px 14px;
		border-bottom: 2px solid transparent;
		color: #999;
		font-size: 15px;
		transition:
			color 120ms,
			border-color 120ms;
	}

	div :global(.tab:hover) {
		color: #fff;
	}

	div :global(.tab[aria-selected='true']) {
		border-bottom-color: #fff;
		color: #fff;
	}

	div :global(.tab:focus-visible) {
		outline-offset: -2px;
	}
</style>
