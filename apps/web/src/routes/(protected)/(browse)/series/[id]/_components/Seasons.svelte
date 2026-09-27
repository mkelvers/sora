<script lang="ts">
	import type { Season } from "@sora/sdk";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";

	type Props = {
		seasons: Season[];
		season: Season;
	};

	let {
		seasons,
		season = $bindable(),
	}: Props = $props();
</script>

<div class="seasons">
	<Dropdown id="seasons" class="menu" role="menu" aria-label="Seasons">
		{#snippet trigger()}
			<Icon name="expand" size="md" />
			<span class="current">{season.title}</span>
		{/snippet}

		{#each seasons as other (other.id)}
			<Button
				role="menuitemradio"
				aria-checked={other.id === season.id}
				popovertarget="seasons"
				popovertargetaction="hide"
				onclick={() => (season = other)}
			>
				<span class="title">{other.title}</span>
				<span class="count">
					{other.episode_count}
					{other.episode_count === 1 ? "Episode" : "Episodes"}
				</span>
			</Button>
		{/each}
	</Dropdown>
</div>

<style>
	.seasons {
		min-width: 0;
	}

	.seasons :global(.dropdown-trigger),
	.seasons :global(.dropdown-trigger:hover),
	.seasons :global(.dropdown-trigger:focus-visible),
	.seasons:has(:popover-open) :global(.dropdown-trigger) {
		gap: 2px;
		max-width: 100%;
		padding: 4px 0;
		background: none;
		color: #fff;
		font-size: 18px;
		outline: none;
	}

	.current {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.seasons :global(.menu) {
		width: max-content;
		max-width: min(440px, calc(100vw - 32px));
		max-height: min(60vh, 480px);
		overflow: hidden auto;
	}

	.seasons :global(.menu > .button) {
		gap: 24px;
		padding: 12px 20px;
		color: #888;
		font-size: 15px;
	}

	.seasons :global(.menu > .button[aria-checked="true"]),
	.seasons :global(.menu > .button:hover),
	.seasons :global(.menu > .button:focus-visible) {
		color: #fff;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		margin-left: auto;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
</style>
