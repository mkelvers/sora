<script lang="ts">
	import { Dropdown, Option } from '$lib/components/dropdown';
	import Icon from '$lib/components/Icon.svelte';
	import { getImages } from '../artwork.remote';
	import type { ArtworkFilters } from '../artwork-filters.svelte';

	type Props = {
		seriesId: string;
		filters: ArtworkFilters;
	};

	let { seriesId, filters }: Props = $props();

	const images = $derived((await getImages(seriesId)).filter((image) => image.type === filters.type));

	const languageCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const image of images) {
			const code = image.language ?? 'none';
			counts.set(code, (counts.get(code) ?? 0) + 1);
		}

		return [...counts].sort(([leftCode, leftCount], [rightCode, rightCount]) => {
			if (leftCode === 'none') {
				return -1;
			}
			if (rightCode === 'none') {
				return 1;
			}
			return rightCount - leftCount;
		});
	});

	const seasonNumbers = $derived.by(() => {
		const numbers = new Set<number>();
		for (const image of images) {
			if (image.season_number !== null) {
				numbers.add(image.season_number);
			}
		}
		return [...numbers].sort((left, right) => left - right);
	});

	const names = new Intl.DisplayNames(['en'], {
		type: 'language'
	});

	function toggle(code: string) {
		filters.languages = filters.languages.includes(code)
			? filters.languages.filter((language) => language !== code)
			: [...filters.languages, code];
	}
</script>

<section class="select">
	<h2>Sort by</h2>
	<Dropdown bind:value={filters.sort} label="Sort by">
		<Option value="votes">Most liked</Option>
		<Option value="quality">Best quality</Option>
	</Dropdown>
</section>

{#if seasonNumbers.length > 0}
	<section class="select">
		<h2>Made for</h2>
		<Dropdown bind:value={filters.source} label="Made for">
			<Option value="all">Any season</Option>
			<Option value="series">The whole title</Option>
			{#each seasonNumbers as number (number)}
				<Option value={String(number)}>{number === 0 ? 'Specials' : `Season ${number}`}</Option>
			{/each}
		</Dropdown>
	</section>
{/if}

{#if languageCounts.length > 1}
	<section>
		<h2>Language</h2>
		<div class="languages" role="group" aria-label="Language">
			<button aria-pressed={filters.languages.length === 0} onclick={() => (filters.languages = [])}>
				<span class="check">
					{#if filters.languages.length === 0}
						<Icon name="check" size="sm" />
					{/if}
				</span>
				All
			</button>
			{#each languageCounts as [code, count] (code)}
				{@const pressed = filters.languages.includes(code)}
				<button aria-pressed={pressed} onclick={() => toggle(code)}>
					<span class="check">
						{#if pressed}
							<Icon name="check" size="sm" />
						{/if}
					</span>
					{code === 'none' ? 'Textless' : names.of(code)}
					<span class="count">{count}</span>
				</button>
			{/each}
		</div>
	</section>
{/if}

<style>
	section {
		display: grid;
		gap: 10px;
	}

	h2 {
		margin: 0;
		color: #999;
		font-size: 12px;
		font-weight: 400;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.select :global(.dropdown) {
		display: block;
	}

	.select :global(.dropdown > button) {
		justify-content: space-between;
		width: 100%;
	}

	.languages {
		display: grid;
		gap: 2px;
	}

	.languages button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px 7px 8px;
		border: none;
		border-radius: 4px;
		background: none;
		color: #999;
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.languages button:hover {
		background: rgb(255 255 255 / 0.06);
		color: #fff;
	}

	.languages button[aria-pressed='true'] {
		color: #fff;
	}

	.check {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 16px;
		height: 16px;
	}

	.count {
		margin-left: auto;
		color: #666;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
