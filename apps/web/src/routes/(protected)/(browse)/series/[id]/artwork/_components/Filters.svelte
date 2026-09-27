<script lang="ts">
	import { CaretDownIcon, CheckIcon } from "phosphor-svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn } from "$lib/utils";
	import { getImages } from "../artwork.remote";
	import type { Artwork } from "../artwork.svelte";
	import { languages as languageNames } from "$lib/utils";

	type Props = {
		seriesId: string;
		artwork: Artwork;
	};

	let {
		seriesId,
		artwork,
	}: Props = $props();

	type Menu = {
		id: string;
		label: string;
		value: string;
		options: {
			value: string;
			label: string;
		}[];
		select: (value: string) => void;
	};

	const images = $derived(
		(await getImages(seriesId)).filter(
			(image) => image.type === artwork.type,
		),
	);

	const languages = $derived.by(() => {
		const groups = Map.groupBy(images, (image) => image.language ?? "none");
		const languages = [...groups].map(([code, images]) => ({
			code,
			count: images.length,
		}));

		return languages.toSorted((a, b) => {
			if (a.code === "none") {
				return -1;
			}

			if (b.code === "none") {
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
			id: "artwork-sort",
			label: "Sort by",
			value: artwork.sort,
			options: [
				{
					value: "votes",
					label: "Most liked",
				},
				{
					value: "quality",
					label: "Best quality",
				},
			],
			select: (value) => (artwork.sort = value as Artwork["sort"]),
		});

		if (seasons.length > 0) {
			menus.push({
				id: "artwork-source",
				label: "Made for",
				value: artwork.source,
				options: [
					{
						value: "all",
						label: "Any season",
					},
					{
						value: "series",
						label: "The whole title",
					},
					...seasons.map((number) => ({
						value: String(number),
						label: number === 0 ? "Specials" : `Season ${number}`,
					})),
				],
				select: (value) => (artwork.source = value),
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
	<section>
		<h2 class="mb-2 text-xs font-bold text-foreground uppercase">{menu.label}</h2>
		<div class="[&_.dropdown-trigger]:w-full [&_.dropdown-trigger]:justify-between [&_.dropdown-trigger]:border [&_.dropdown-trigger]:border-border [&_.dropdown-trigger]:px-3 [&_.dropdown-trigger]:normal-case [&_.dropdown-trigger]:tracking-normal [&_.dropdown-trigger]:text-foreground">
			<Dropdown id={menu.id} alignment="left" className="*:p-0">
				{#snippet trigger()}
					{menu.options.find((option) => option.value === menu.value)?.label}
					<CaretDownIcon size="0.9rem" weight="fill" />
				{/snippet}

				{#snippet children()}
					<div role="menu" aria-label={menu.label}>
						{#each menu.options as option (option.value)}
							{@const checked = option.value === menu.value}
							<Button
								role="menuitemradio"
								aria-checked={checked}
								popovertarget={menu.id}
								popovertargetaction="hide"
								class={cn(
									"flex w-full items-center justify-start gap-3 px-4 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground",
									checked && "text-foreground",
								)}
								onclick={() => menu.select(option.value)}
							>
								<span class="grid w-4 place-items-center text-accent">
									{#if checked}
										<CheckIcon size="0.9rem" weight="bold" />
									{/if}
								</span>
								{option.label}
							</Button>
						{/each}
					</div>
				{/snippet}
			</Dropdown>
		</div>
	</section>
{/each}

{#if languages.length > 1}
	<section>
		<h2 class="mb-2 text-xs font-bold text-foreground uppercase">Language</h2>
		<div class="grid" role="group" aria-label="Language">
			{#each [{ code: "", count: images.length }, ...languages] as language (language.code)}
				{@const pressed = language.code ? artwork.languages.includes(language.code) : artwork.languages.length === 0}
				<Button
					aria-pressed={pressed}
					class={cn(
						"flex min-h-10 items-center justify-start gap-3 px-2 text-left text-sm text-muted hover:bg-surface hover:text-foreground",
						pressed && "text-foreground",
					)}
					onclick={() => (language.code ? toggle(language.code) : (artwork.languages = []))}
				>
					<span class="grid w-4 place-items-center text-accent">
						{#if pressed}
							<CheckIcon size="0.9rem" weight="bold" />
						{/if}
					</span>
					{language.code === "" ? "All" : language.code === "none" ? "Textless" : languageNames.of(language.code)}
					<span class="ml-auto text-xs text-subtle tabular-nums">{language.count}</span>
				</Button>
			{/each}
		</div>
	</section>
{/if}
