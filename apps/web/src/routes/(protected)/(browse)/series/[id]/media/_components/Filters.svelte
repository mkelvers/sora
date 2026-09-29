<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { languages as languageNames } from "$lib/utils";
	import { Select } from "melt/builders";
	import { CaretDownIcon } from "phosphor-svelte";

	import { getImages } from "../media.remote";
	import type { Media } from "../media.svelte";

	type Props = {
		seriesId: string;
		media: Media;
	};

	let { seriesId, media }: Props = $props();

	type Menu = {
		label: string;
		select: Select<string>;
		options: {
			value: string;
			label: string;
		}[];
	};

	const images = $derived((await getImages(seriesId)).filter((image) => image.type === media.type));

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
		value: () => media.sort,
		onValueChange: (value) => (media.sort = value as Media["sort"]),
		floatingConfig,
	});

	const source = new Select<string>({
		value: () => media.source,
		onValueChange: (value) => (media.source = value ?? "all"),
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
		media.languages = media.languages.includes(code)
			? media.languages.filter((language) => language !== code)
			: [...media.languages, code];
	}
</script>

{#each menus as menu (menu.label)}
	<section>
		<h2 class="mb-3 text-xs font-bold tracking-wide text-subtle uppercase">{menu.label}</h2>
		<button
			{...menu.select.trigger}
			type="button"
			class="flex h-10 w-full cursor-pointer items-center justify-between gap-2 border border-border px-3 text-sm font-medium text-foreground transition-colors outline-none hover:border-border-strong focus-visible:ring-1 focus-visible:ring-white/30 aria-expanded:border-border-strong"
		>
			{menu.options.find((option) => option.value === menu.select.value)?.label}
			<CaretDownIcon size="0.9rem" weight="fill" class="shrink-0 text-muted" />
		</button>

		<div
			{...menu.select.content}
			aria-label={menu.label}
			class="inset-auto m-0 max-h-[min(60vh,24rem)] flex-col overflow-y-auto bg-dropdown shadow-2xl shadow-black/60 outline-none open:flex"
		>
			{#each menu.options as option (option.value)}
				<div
					{...menu.select.getOption(option.value, option.label)}
					class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm text-dropdown-foreground data-highlighted:bg-dropdown-hover data-highlighted:text-foreground"
				>
					{option.label}
				</div>
			{/each}
		</div>
	</section>
{/each}

{#if languages.length > 1}
	<section>
		<h2 class="mb-2 text-xs font-bold tracking-wide text-subtle uppercase">Language</h2>
		<div class="grid" role="group" aria-label="Language">
			{#each [{ code: "", count: images.length }, ...languages] as language (language.code)}
				{@const pressed = language.code
					? media.languages.includes(language.code)
					: media.languages.length === 0}
				<Button
					aria-pressed={pressed}
					variant="item"
					class={cn("min-h-9 gap-3 px-2 py-0", pressed && "bg-white/8 text-foreground")}
					onclick={() => (language.code ? toggle(language.code) : (media.languages = []))}
				>
					<span class="min-w-0 truncate">
						{#if language.code === ""}
							All
						{:else if language.code === "none"}
							Textless
						{:else}
							{languageNames.of(language.code)}
						{/if}
					</span>
					<span class="ml-auto text-xs text-subtle tabular-nums">{language.count}</span>
				</Button>
			{/each}
		</div>
	</section>
{/if}
