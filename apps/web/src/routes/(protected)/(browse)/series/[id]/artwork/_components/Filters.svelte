<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { languages as languageNames } from "$lib/utils";
	import { Select } from "melt/builders";
	import { CaretDownIcon, CheckIcon } from "phosphor-svelte";

	import { getImages } from "../artwork.remote";
	import type { Artwork } from "../artwork.svelte";

	type Props = {
		seriesId: string;
		artwork: Artwork;
	};

	let { seriesId, artwork }: Props = $props();

	type Menu = {
		label: string;
		select: Select<string>;
		options: {
			value: string;
			label: string;
		}[];
	};

	const images = $derived(
		(await getImages(seriesId)).filter((image) => image.type === artwork.type),
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

		return [...numbers].filter((number) => number !== null).toSorted((a, b) => a - b);
	});

	const floatingConfig = {
		computePosition: {
			placement: "bottom-start" as const,
		},
		offset: 0,
	};

	const sort = new Select<string>({
		value: () => artwork.sort,
		onValueChange: (value) => (artwork.sort = value as Artwork["sort"]),
		floatingConfig,
	});

	const source = new Select<string>({
		value: () => artwork.source,
		onValueChange: (value) => (artwork.source = value ?? "all"),
		floatingConfig,
	});

	const menus = $derived.by(() => {
		const menus: Menu[] = [];

		menus.push({
			label: "Sort by",
			select: sort,
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
		});

		if (seasons.length > 0) {
			menus.push({
				label: "Made for",
				select: source,
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

{#each menus as menu (menu.label)}
	<section>
		<h2 class="mb-2 text-xs font-bold text-foreground uppercase">{menu.label}</h2>
		<button
			{...menu.select.trigger}
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-2 border border-border p-2 px-3 text-[0.875rem] font-medium text-foreground outline-none hover:bg-dropdown focus-visible:ring-1 focus-visible:ring-white/30"
		>
			{menu.options.find((option) => option.value === menu.select.value)?.label}
			<CaretDownIcon size="0.9rem" weight="fill" />
		</button>

		<div
			{...menu.select.content}
			aria-label={menu.label}
			class="inset-auto m-0 flex-col bg-dropdown shadow-lg outline-none open:flex"
		>
			{#each menu.options as option (option.value)}
				<div
					{...menu.select.getOption(option.value, option.label)}
					class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm text-muted hover:text-foreground aria-selected:text-foreground data-highlighted:bg-panel-hover"
				>
					<span class="grid w-4 place-items-center text-accent">
						{#if option.value === menu.select.value}
							<CheckIcon size="0.9rem" weight="bold" />
						{/if}
					</span>
					{option.label}
				</div>
			{/each}
		</div>
	</section>
{/each}

{#if languages.length > 1}
	<section>
		<h2 class="mb-2 text-xs font-bold text-foreground uppercase">Language</h2>
		<div class="grid" role="group" aria-label="Language">
			{#each [{ code: "", count: images.length }, ...languages] as language (language.code)}
				{@const pressed = language.code
					? artwork.languages.includes(language.code)
					: artwork.languages.length === 0}
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
					{language.code === ""
						? "All"
						: language.code === "none"
							? "Textless"
							: languageNames.of(language.code)}
					<span class="ml-auto text-xs text-subtle tabular-nums">{language.count}</span>
				</Button>
			{/each}
		</div>
	</section>
{/if}
