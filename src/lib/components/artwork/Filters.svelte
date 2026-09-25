<script lang="ts">
	import { getImages } from '$lib/remote/anime.remote';
	import type { ArtworkFilters } from './artwork-filters.svelte';
	import { chooseArtwork } from './choose-artwork';

	type Props = {
		seriesId: string;
		filters: ArtworkFilters;
	};

	let { seriesId, filters }: Props = $props();

	const images = $derived((await getImages(seriesId)).filter((image) => image.type === filters.type));

	/** Languages among this type's images, most used first, textless on top. */
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

	const types = [
		{
			value: 'poster',
			label: 'Posters'
		},
		{
			value: 'backdrop',
			label: 'Backdrops'
		},
		{
			value: 'logo',
			label: 'Logos'
		}
	] as const;

	const names = new Intl.DisplayNames(['en'], {
		type: 'language'
	});

	let failed = $state(false);

	async function reset() {
		try {
			await chooseArtwork(seriesId, filters.type, null);
			failed = false;
		} catch {
			failed = true;
		}
	}
</script>

<div class="types" role="radiogroup" aria-label="Type">
	{#each types as option (option.value)}
		<button role="radio" aria-checked={filters.type === option.value} onclick={() => (filters.type = option.value)}>
			{option.label}
		</button>
	{/each}
</div>

<fieldset>
	<legend>Sort by</legend>
	<select bind:value={filters.sort} aria-label="Sort by">
		<option value="votes">Most liked</option>
		<option value="quality">Best quality</option>
	</select>
</fieldset>

{#if seasonNumbers.length > 0}
	<fieldset>
		<legend>Made for</legend>
		<select bind:value={filters.source} aria-label="Made for">
			<option value="all">Everything</option>
			<option value="series">The whole title</option>
			{#each seasonNumbers as number (number)}
				<option value={String(number)}>{number === 0 ? 'Specials' : `Season ${number}`}</option>
			{/each}
		</select>
	</fieldset>
{/if}

{#if languageCounts.length > 1}
	<fieldset>
		<legend>
			Language
			{#if filters.languages.length > 0}
				<button class="clear" onclick={() => (filters.languages = [])}>Clear</button>
			{/if}
		</legend>
		{#each languageCounts as [code, count] (code)}
			<label>
				<input type="checkbox" bind:group={filters.languages} value={code} />
				{code === 'none' ? 'Textless' : names.of(code)}
				<span class="count">{count}</span>
			</label>
		{/each}
	</fieldset>
{/if}

<button class="reset" onclick={reset}>Use default</button>

{#if failed}
	<p class="error" role="alert">The default couldn’t be restored.</p>
{/if}

<style>
	.types {
		display: grid;
		gap: 2px;
	}

	.types button {
		padding: 10px 12px;
		border: none;
		border-left: 2px solid transparent;
		background: none;
		color: #999;
		font: inherit;
		font-size: 15px;
		text-align: left;
		cursor: pointer;
	}

	.types button:hover {
		color: #fff;
	}

	.types button[aria-checked='true'] {
		border-left-color: #fff;
		background: #1a1a1a;
		color: #fff;
	}

	fieldset {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		display: flex;
		justify-content: space-between;
		width: 100%;
		margin-bottom: 8px;
		padding: 0;
		color: #999;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	label {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		cursor: pointer;
	}

	.count {
		margin-left: auto;
		color: #666;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}

	input {
		display: grid;
		place-items: center;
		flex: none;
		width: 16px;
		height: 16px;
		margin: 0;
		border: 1px solid #555;
		background: #161616;
		appearance: none;
		cursor: pointer;
		transition:
			border-color 120ms,
			background 120ms;
	}

	input:hover {
		border-color: #888;
	}

	input:checked {
		border-color: #e6e6e6;
		background: #e6e6e6;
	}

	/* A check mark: two borders of a box, turned. */
	input:checked::after {
		width: 4px;
		height: 8px;
		margin-top: -2px;
		border: solid #101010;
		border-width: 0 2px 2px 0;
		content: '';
		transform: rotate(45deg);
	}

	select {
		padding: 9px 36px 9px 12px;
		border: 1px solid #333;
		background: #161616
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")
			no-repeat right 12px center;
		color: inherit;
		font: inherit;
		font-size: 14px;
		appearance: none;
		cursor: pointer;
	}

	select:hover {
		border-color: #555;
	}

	.clear {
		padding: 0;
		border: none;
		background: none;
		color: #999;
		font: inherit;
		font-size: 12px;
		letter-spacing: normal;
		text-transform: none;
		text-decoration: underline;
		cursor: pointer;
	}

	.reset {
		justify-self: start;
		padding: 9px 14px;
		border: 1px solid #333;
		background: none;
		color: #e6e6e6;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.reset:hover {
		background: #1a1a1a;
	}

	.error {
		margin: 0;
		color: #f28b82;
		font-size: 14px;
	}

	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
