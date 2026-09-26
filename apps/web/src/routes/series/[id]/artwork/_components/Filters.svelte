<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { getImages } from '../artwork.remote';
	import type { Artwork } from '../artwork.svelte';
	import { formatLanguage, formatSeason } from '$lib/utils';

	type Props = {
		seriesId: string;
		artwork: Artwork;
	};

	let { seriesId, artwork }: Props = $props();

	type Menu = {
		id: string;
		label: string;
		value: string;
		options: { value: string; label: string }[];
		select: (value: string) => void;
	};

	const images = $derived(
		(await getImages(seriesId)).filter((image) => image.type === artwork.type)
	);

	const languages = $derived.by(() => {
		const groups = Map.groupBy(images, (image) => image.language ?? 'none');
		const languages = [...groups].map(([code, images]) => ({
			code,
			count: images.length
		}));

		return languages.toSorted((a, b) => {
			if (a.code === 'none') {
				return -1;
			}

			if (b.code === 'none') {
				return 1;
			}

			return b.count - a.count;
		});
	});

	const seasons = $derived.by(() => {
		const numbers = new Set(images.map((image) => image.season_number));

		return [...numbers]
			.filter((number) => number !== null)
			.toSorted((a, b) => a - b);
	});

	const menus = $derived.by(() => {
		const menus: Menu[] = [];

		menus.push({
			id: 'artwork-sort',
			label: 'Sort by',
			value: artwork.sort,
			options: [
				{
					value: 'votes',
					label: 'Most liked'
				},
				{
					value: 'quality',
					label: 'Best quality'
				}
			],
			select: (value) => (artwork.sort = value as Artwork['sort'])
		});

		if (seasons.length > 0) {
			menus.push({
				id: 'artwork-source',
				label: 'Made for',
				value: artwork.source,
				options: [
					{
						value: 'all',
						label: 'Any season'
					},
					{
						value: 'series',
						label: 'The whole title'
					},
					...seasons.map((number) => ({
						value: String(number),
						label: formatSeason(number)
					}))
				],
				select: (value) => (artwork.source = value)
			});
		}

		return menus;
	});

	function toggle(code: string) {
		artwork.languages = artwork.languages.includes(code)
			? artwork.languages.filter((language) => language !== code)
			: [...artwork.languages, code];
	}
</script>

{#each menus as menu (menu.id)}
	<section class="select">
		<h2>{menu.label}</h2>
		<Dropdown id={menu.id} alignment="left" role="menu" aria-label={menu.label}>
			{#snippet trigger()}
				{menu.options.find((option) => option.value === menu.value)?.label}
				<Icon name="expand" size="sm" />
			{/snippet}

			{#each menu.options as option (option.value)}
				{@const checked = option.value === menu.value}
				<Button
					role="menuitemradio"
					aria-checked={checked}
					popovertarget={menu.id}
					popovertargetaction="hide"
					onclick={() => menu.select(option.value)}
				>
					<span class="check">
						{#if checked}
							<Icon name="check" size="sm" />
						{/if}
					</span>
					{option.label}
				</Button>
			{/each}
		</Dropdown>
	</section>
{/each}

{#if languages.length > 1}
	<section>
		<h2>Language</h2>
		<div class="languages" role="group" aria-label="Language">
			<Button
				variant="ghost"
				aria-pressed={artwork.languages.length === 0}
				onclick={() => (artwork.languages = [])}
			>
				<span class="check">
					{#if artwork.languages.length === 0}
						<Icon name="check" size="sm" />
					{/if}
				</span>
				All
			</Button>

			{#each languages as language (language.code)}
				{@const pressed = artwork.languages.includes(language.code)}
				<Button
					variant="ghost"
					aria-pressed={pressed}
					onclick={() => toggle(language.code)}
				>
					<span class="check">
						{#if pressed}
							<Icon name="check" size="sm" />
						{/if}
					</span>
					{formatLanguage(language.code === 'none' ? null : language.code)}
					<span class="count">{language.count}</span>
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
