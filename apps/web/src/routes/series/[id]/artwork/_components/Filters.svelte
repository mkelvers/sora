<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';
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

	const sorts = [
		{ value: 'votes', label: 'Most liked' },
		{ value: 'quality', label: 'Best quality' }
	] as const;

	const sources = $derived([
		{ value: 'all', label: 'Any season' },
		{ value: 'series', label: 'The whole title' },
		...seasonNumbers.map((number) => ({ value: String(number), label: number === 0 ? 'Specials' : `Season ${number}` }))
	]);

	const names = new Intl.DisplayNames(['en'], {
		type: 'language'
	});

	function toggle(code: string) {
		filters.languages = filters.languages.includes(code)
			? filters.languages.filter((language) => language !== code)
			: [...filters.languages, code];
	}
</script>

{#snippet option(dropdown: string, label: string, checked: boolean, select: () => void)}
	<Button role="menuitemradio" aria-checked={checked} popovertarget={dropdown} popovertargetaction="hide" onclick={select}>
		<span class="check">
			{#if checked}
				<Icon name="check" size="sm" />
			{/if}
		</span>
		{label}
	</Button>
{/snippet}

<section class="select">
	<h2>Sort by</h2>
	<Dropdown id="artwork-sort" alignment="left" role="menu" aria-label="Sort by">
		{#snippet trigger()}
			{sorts.find((sort) => sort.value === filters.sort)?.label}
			<Icon name="expand" size="sm" />
		{/snippet}

		{#each sorts as sort (sort.value)}
			{@render option('artwork-sort', sort.label, filters.sort === sort.value, () => (filters.sort = sort.value))}
		{/each}
	</Dropdown>
</section>

{#if seasonNumbers.length > 0}
	<section class="select">
		<h2>Made for</h2>
		<Dropdown id="artwork-source" alignment="left" role="menu" aria-label="Made for">
			{#snippet trigger()}
				{sources.find((source) => source.value === filters.source)?.label}
				<Icon name="expand" size="sm" />
			{/snippet}

			{#each sources as source (source.value)}
				{@render option('artwork-source', source.label, filters.source === source.value, () => (filters.source = source.value))}
			{/each}
		</Dropdown>
	</section>
{/if}

{#if languageCounts.length > 1}
	<section>
		<h2>Language</h2>
		<div class="languages" role="group" aria-label="Language">
			<Button variant="ghost" aria-pressed={filters.languages.length === 0} onclick={() => (filters.languages = [])}>
				<span class="check">
					{#if filters.languages.length === 0}
						<Icon name="check" size="sm" />
					{/if}
				</span>
				All
			</Button>
			{#each languageCounts as [code, count] (code)}
				{@const pressed = filters.languages.includes(code)}
				<Button variant="ghost" aria-pressed={pressed} onclick={() => toggle(code)}>
					<span class="check">
						{#if pressed}
							<Icon name="check" size="sm" />
						{/if}
					</span>
					{code === 'none' ? 'Textless' : names.of(code)}
					<span class="count">{count}</span>
				</Button>
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

	.select :global(.dropdown-trigger) {
		justify-content: space-between;
		width: 100%;
		padding: 7px 8px 7px 12px;
		background: rgb(255 255 255 / 0.06);
		color: #e6e6e6;
	}

	.select :global(.dropdown-trigger:hover),
	.select:has(:popover-open) :global(.dropdown-trigger) {
		background: rgb(255 255 255 / 0.1);
	}

	.select :global(.dropdown-trigger svg) {
		color: #999;
	}

	.languages {
		display: grid;
		gap: 2px;
	}

	.languages > :global(.button) {
		justify-content: flex-start;
		padding: 7px 12px 7px 8px;
		color: #999;
		text-align: left;
	}

	.languages > :global(.button:hover),
	.languages > :global([aria-pressed='true']) {
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
</style>
