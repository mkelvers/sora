<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let { series, images } = $derived(data);

	const kinds = [
		{
			type: 'poster',
			field: 'poster_url',
			label: 'Posters',
			thumb: 'w342'
		},
		{
			type: 'backdrop',
			field: 'backdrop_url',
			label: 'Backdrops',
			thumb: 'w780'
		},
		{
			type: 'logo',
			field: 'logo_url',
			label: 'Logos',
			thumb: 'w300'
		}
	] as const;

	let kind = $state<(typeof kinds)[number]>(kinds[0]);
	let sort = $state<'votes' | 'quality'>('votes');
	let languages = $state<string[]>([]);
	let source = $state('all');
	let choosing = $state<string | null>(null);

	// Filters belong to the kind they were set on.
	$effect(() => {
		void kind;
		languages = [];
		source = 'all';
	});

	let ofKind = $derived(images.filter((image) => image.type === kind.type));

	/** Languages among this kind's images, most used first, textless on top. */
	let languageCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const image of ofKind) {
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

	let seasonNumbers = $derived.by(() => {
		const numbers = new Set<number>();
		for (const image of ofKind) {
			if (image.season_number !== null) {
				numbers.add(image.season_number);
			}
		}
		return [...numbers].sort((left, right) => left - right);
	});

	let shown = $derived.by(() => {
		let result = ofKind;

		if (languages.length > 0) {
			result = result.filter((image) => languages.includes(image.language ?? 'none'));
		}

		if (source === 'series') {
			result = result.filter((image) => image.season_number === null);
		} else if (source !== 'all') {
			result = result.filter((image) => image.season_number === Number(source));
		}

		// The API lists images by votes already; quality is sorted here.
		if (sort === 'quality') {
			result = result.toSorted((left, right) => right.width * right.height - left.width * left.height);
		}

		return result;
	});

	const languageNames = new Intl.DisplayNames(['en'], {
		type: 'language'
	});

	/** The current image's file name, which stays the same across TMDB's sizes. */
	let currentFile = $derived(series[kind.field]?.split('/').at(-1));

	let status = $derived(form?.field === kind.field ? form : null);
</script>

<svelte:head>
	<title>Artwork · {series.title}</title>
</svelte:head>

<div class="page">
	<aside>
		<a class="back" href="/anime/{series.id}">
			<Icon name="back" size={20} />
			<span>{series.title}</span>
		</a>
		<h1>Artwork</h1>

		<div class="group" role="radiogroup" aria-label="Kind">
			{#each kinds as option (option.type)}
				<button
					class="kind"
					role="radio"
					aria-checked={kind.type === option.type}
					onclick={() => (kind = option)}
				>
					{option.label}
				</button>
			{/each}
		</div>

		<fieldset>
			<legend>Sort by</legend>
			<label><input type="radio" bind:group={sort} value="votes" /> Most liked</label>
			<label><input type="radio" bind:group={sort} value="quality" /> Best quality</label>
		</fieldset>

		{#if seasonNumbers.length > 0}
			<fieldset>
				<legend>Made for</legend>
				<select bind:value={source} aria-label="Made for">
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
					{#if languages.length > 0}
						<button class="clear" onclick={() => (languages = [])}>Clear</button>
					{/if}
				</legend>
				{#each languageCounts as [code, count] (code)}
					<label>
						<input type="checkbox" bind:group={languages} value={code} />
						{code === 'none' ? 'Textless' : languageNames.of(code)}
						<span class="count">{count}</span>
					</label>
				{/each}
			</fieldset>
		{/if}

		<form
			method="POST"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					choosing = null;
				}}
		>
			<input type="hidden" name="field" value={kind.field} />
			<button class="reset" name="reset" value="1">Use Sora’s default</button>
		</form>
	</aside>

	<main>
		<header>
			<h2>{kind.label}</h2>
			{#if status?.error}
				<p class="error" role="alert">{status.error}</p>
			{:else if status?.saved}
				<p class="saved" role="status">Saved for everyone.</p>
			{/if}
		</header>

		{#if shown.length === 0}
			<p class="hint">
				{#if ofKind.length === 0}
					TMDB has no {kind.label.toLowerCase()} for this title.
				{:else}
					Nothing matches these filters.
				{/if}
			</p>
		{:else}
			<form
				class="grid {kind.type}"
				method="POST"
				use:enhance={({ submitter }) => {
					choosing = (submitter as HTMLButtonElement | null)?.value ?? null;
					return async ({ update }) => {
						await update();
						choosing = null;
					};
				}}
			>
				<input type="hidden" name="field" value={kind.field} />
				{#each shown as image (image.url)}
					{@const current = choosing ? choosing === image.url : currentFile === image.url.split('/').at(-1)}
					<button class="card" class:current name="url" value={image.url} aria-pressed={current}>
						<span class="image">
							<img src={image.url.replace('/original/', `/${kind.thumb}/`)} alt="" loading="lazy" />
							{#if current}
								<span class="badge"><Icon name="check" size={16} /> Current</span>
							{/if}
						</span>
						<span class="meta">
							<span>{image.width}×{image.height}</span>
							<span>{image.language ? languageNames.of(image.language) : 'Textless'}</span>
							{#if image.season_number !== null}
								<span>{image.season_number === 0 ? 'Specials' : `Season ${image.season_number}`}</span>
							{/if}
							<span class="votes" title="{image.vote_count} votes">
								<Icon name="heart" size={12} />
								{image.vote_average.toFixed(1)}
							</span>
						</span>
					</button>
				{/each}
			</form>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.page {
		--muted: #999;
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 40px;
		min-height: 100vh;
		box-sizing: border-box;
		padding: 32px clamp(16px, 3.3vw, 64px) 64px;
		background: #101010;
		color: #e6e6e6;
		font-family: system-ui, sans-serif;
	}

	aside {
		position: sticky;
		top: 32px;
		align-self: start;
		display: grid;
		gap: 24px;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--muted);
		font-size: 14px;
		text-decoration: none;
	}

	.back:hover {
		color: #fff;
	}

	h1 {
		margin: -12px 0 0;
		font-size: 28px;
		font-weight: 400;
	}

	.group {
		display: grid;
		gap: 2px;
	}

	.kind {
		padding: 10px 12px;
		border: none;
		border-left: 2px solid transparent;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 15px;
		text-align: left;
		cursor: pointer;
	}

	.kind:hover {
		color: #fff;
	}

	.kind[aria-checked='true'] {
		border-left-color: #fff;
		background: #1a1a1a;
		color: #fff;
	}

	.count {
		color: #666;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
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
		color: var(--muted);
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

	label .count {
		margin-left: auto;
	}

	input[type='radio'],
	input[type='checkbox'] {
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

	input[type='radio'] {
		border-radius: 50%;
	}

	input[type='radio']:hover,
	input[type='checkbox']:hover {
		border-color: #888;
	}

	input[type='radio']:checked {
		border-color: #e6e6e6;
	}

	input[type='radio']:checked::after {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #e6e6e6;
		content: '';
	}

	input[type='checkbox']:checked {
		border-color: #e6e6e6;
		background: #e6e6e6;
	}

	/* A check mark: two borders of a box, turned. */
	input[type='checkbox']:checked::after {
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

	.clear,
	.reset {
		padding: 0;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}

	.clear {
		font-size: 12px;
		letter-spacing: normal;
		text-transform: none;
		text-decoration: underline;
	}

	.reset {
		padding: 9px 14px;
		border: 1px solid #333;
		color: #e6e6e6;
		font-size: 14px;
	}

	.reset:hover {
		background: #1a1a1a;
	}

	button:focus-visible,
	select:focus-visible,
	input:focus-visible,
	.back:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	main header {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 20px;
	}

	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 400;
	}

	.hint,
	.saved,
	.error {
		margin: 0;
		font-size: 14px;
	}

	.hint {
		color: #777;
	}

	.saved {
		color: #52b54b;
	}

	.error {
		color: #f28b82;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 24px;
	}

	.grid.poster {
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}

	.card {
		display: grid;
		gap: 8px;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.image {
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		background: #1c1c1c;
		outline: 2px solid transparent;
		outline-offset: 2px;
		transition: outline-color 120ms;
	}

	.poster .image {
		aspect-ratio: 2 / 3;
	}

	/* Logos are drawn over a dark checkerboard, as they sit over backdrops. */
	.logo .image {
		background: repeating-conic-gradient(#1c1c1c 0% 25%, #242424 0% 50%) 0 0 / 20px 20px;
	}

	.image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.logo .image img {
		box-sizing: border-box;
		padding: 16px;
		object-fit: contain;
	}

	.card:hover .image {
		outline-color: #555;
	}

	.card.current .image {
		outline-color: #fff;
	}

	.badge {
		position: absolute;
		top: 8px;
		left: 8px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px 4px 6px;
		background: #fff;
		color: #101010;
		font-size: 12px;
		font-weight: 600;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		color: var(--muted);
		font-size: 12px;
	}

	.votes {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		margin-left: auto;
	}

	@media (max-width: 860px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
		}

		aside {
			position: static;
		}

		.group {
			grid-auto-flow: column;
		}

		.kind {
			border-left: none;
			border-bottom: 2px solid transparent;
		}

		.kind[aria-checked='true'] {
			border-bottom-color: #fff;
		}
	}
</style>
