<script lang="ts">
	import backdrop from "$lib/assets/subtitle-preview.webp";
	import Cue from "$lib/components/cue.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Select from "$lib/components/ui/select.svelte";
	import {
		getPlaybackPreferences,
		savePlaybackPreferences,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import type { SubtitleStyle } from "@sora/sdk";
	import { attempt } from "@sora/shared";
	import { ArrowCounterClockwiseIcon, CaretLeftIcon } from "phosphor-svelte";

	interface Choice<T extends string | number> {
		label: string;
		value: T;
	}

	const sizes: Choice<SubtitleStyle["size"]>[] = [
		{
			label: "Small",
			value: "small",
		},
		{
			label: "Medium",
			value: "medium",
		},
		{
			label: "Large",
			value: "large",
		},
	];

	const edges: Choice<SubtitleStyle["edge"]>[] = [
		{
			label: "Outline",
			value: "outline",
		},
		{
			label: "Soft Shadow",
			value: "shadow",
		},
		{
			label: "None",
			value: "none",
		},
	];

	const colors: Choice<SubtitleStyle["text_color"]>[] = [
		{
			label: "White",
			value: "white",
		},
		{
			label: "Black",
			value: "black",
		},
		{
			label: "Red",
			value: "red",
		},
		{
			label: "Green",
			value: "green",
		},
		{
			label: "Blue",
			value: "blue",
		},
		{
			label: "Yellow",
			value: "yellow",
		},
		{
			label: "Cyan",
			value: "cyan",
		},
		{
			label: "Magenta",
			value: "magenta",
		},
	];

	const widths: Choice<SubtitleStyle["edge_width"]>[] = [
		{
			label: "Thin",
			value: "thin",
		},
		{
			label: "Medium",
			value: "medium",
		},
		{
			label: "Thick",
			value: "thick",
		},
	];

	const opacities: Choice<SubtitleStyle["background_opacity"]>[] = [
		{
			label: "0%",
			value: 0,
		},
		{
			label: "25%",
			value: 25,
		},
		{
			label: "50%",
			value: 50,
		},
		{
			label: "75%",
			value: 75,
		},
		{
			label: "100%",
			value: 100,
		},
	];

	const playback = getPlaybackPreferences();

	let saved = $state("");
	let failure = $state("");
	let resetting = $state(false);

	const choose = <T extends string | number>(choices: Choice<T>[], value: string) =>
		choices.find((choice) => String(choice.value) === value)?.value;

	const save = async (changes: Partial<SubtitleStyle>) => {
		const { error } = await attempt(
			savePlaybackPreferences({
				subtitle_style: changes,
			}).updates(
				getPlaybackPreferences().withOverride((current) => ({
					...current,
					subtitle_style: {
						...current.subtitle_style,
						...changes,
					},
				})),
			),
		);
		saved = error ? "" : "Subtitle appearance saved.";
		failure = error ? "Your subtitle appearance couldn’t be saved." : "";
	};

	const reset = async () => {
		resetting = true;
		const { error } = await attempt(
			savePlaybackPreferences({
				subtitle_style: null,
			}),
		);
		resetting = false;
		saved = error ? "" : "Subtitle appearance reset.";
		failure = error ? "Your subtitle appearance couldn’t be reset." : "";
	};
</script>

<svelte:head>
	<title>Subtitle Appearance - Settings - Sora</title>
</svelte:head>

<StatusBanner message={saved} ondismiss={() => (saved = "")} />
<StatusBanner message={failure} tone="error" ondismiss={() => (failure = "")} />

{#snippet field(
	label: string,
	choices: Choice<string | number>[],
	value: string | number,
	onchange: (value: string) => void,
)}
	<div>
		<p class="text-xs font-semibold text-subtle">{label}</p>
		<Select
			variant="field"
			{label}
			options={choices.map((choice) => ({
				label: choice.label,
				value: String(choice.value),
			}))}
			class="mt-2 h-10 border-0 border-b border-border px-0 text-base font-medium hover:border-border hover:text-accent-secondary aria-expanded:border-border aria-expanded:text-accent-secondary"
			bind:value={() => String(value), onchange}
		/>
	</div>
{/snippet}

<div class="page">
	<div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
		<Button href="/settings/playback" variant="ghost" size="sm" class="-ml-2">
			<CaretLeftIcon size="0.875rem" weight="bold" />
			Back to Playback
		</Button>
		{#if playback.current}
			<Button
				variant="ghost"
				size="sm"
				class="-mr-2"
				loading={resetting}
				disabled={resetting}
				onclick={reset}
			>
				{#if !resetting}
					<ArrowCounterClockwiseIcon size="0.875rem" weight="bold" />
				{/if}
				Reset to Default
			</Button>
		{/if}
	</div>

	<div class="mx-auto mt-8 max-w-2xl">
		<h1 class="text-2xl font-bold">Subtitle Appearance</h1>
		<p class="mt-2 max-w-lg text-sm leading-relaxed text-muted">
			How subtitles look in Sora's player. Subtitles burned into the video keep their own look.
		</p>

		{#if playback.current}
			{@const style = playback.current.subtitle_style}

			<figure class="@container mt-6" aria-label="Subtitle preview">
				<div
					class="grid aspect-[4/1] grid-cols-1 grid-rows-1 overflow-hidden bg-surface text-[4.5cqw] *:[grid-area:1/1]"
				>
					<img
						src={backdrop}
						alt="Manga panel of long hair and a scarf blowing in the wind"
						width="1200"
						height="480"
						decoding="async"
						class="size-full object-cover"
					/>
					<div class="z-1 mx-[4cqw] mb-[3cqw] flex flex-col items-center self-end">
						<Cue appearance={style}>Subtitles will look like this.</Cue>
					</div>
				</div>
			</figure>

			<section class="mt-8" aria-labelledby="subtitle-text">
				<h2 id="subtitle-text" class="text-lg font-semibold">Text</h2>
				<div class="mt-4 grid gap-x-6 gap-y-6 sm:grid-cols-2">
					{@render field("Size", sizes, style.size, (value) =>
						save({
							size: choose(sizes, value),
						}),
					)}
					{@render field("Colour", colors, style.text_color, (value) =>
						save({
							text_color: choose(colors, value),
						}),
					)}
					{@render field("Edge Style", edges, style.edge, (value) =>
						save({
							edge: choose(edges, value),
						}),
					)}
					{@render field("Edge Thickness", widths, style.edge_width, (value) =>
						save({
							edge_width: choose(widths, value),
						}),
					)}
				</div>
			</section>

			<section class="mt-10" aria-labelledby="subtitle-background">
				<h2 id="subtitle-background" class="text-lg font-semibold">Background</h2>
				<div class="mt-4 grid gap-x-6 gap-y-6 sm:grid-cols-2">
					{@render field("Colour", colors, style.background_color, (value) =>
						save({
							background_color: choose(colors, value),
						}),
					)}
					{@render field("Opacity", opacities, style.background_opacity, (value) =>
						save({
							background_opacity: choose(opacities, value),
						}),
					)}
				</div>
			</section>
		{/if}
	</div>
</div>
