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
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import type { SubtitleStyle } from "@sora/sdk";
	import { attempt } from "@sora/shared";
	import { CaretLeftIcon } from "phosphor-svelte";

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
		<p class="text-xs text-subtle">{label}</p>
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

<Button href="/settings/playback" variant="link" size="sm" class="mb-4">
	<CaretLeftIcon size="0.875rem" weight="bold" />
	Playback
</Button>

<Panel
	title="Subtitle Appearance"
	description="How subtitles look over the picture. Subtitles burned into the video keep their own look."
>
	{#if playback.current}
		{@const style = playback.current.subtitle_style}

		<figure class="@container" aria-label="Subtitle preview">
			<div
				class="grid aspect-[5/2] grid-cols-1 grid-rows-1 overflow-hidden bg-surface text-[4cqw] *:[grid-area:1/1]"
			>
				<img
					src={backdrop}
					alt="Manga panel of long hair and a scarf blowing in the wind"
					width="1200"
					height="480"
					decoding="async"
					class="size-full object-cover"
				/>
				<div class="z-1 mx-[4cqw] mb-[4cqw] flex flex-col items-center self-end">
					<Cue appearance={style}>Subtitles will look like this.</Cue>
				</div>
			</div>
		</figure>

		<section aria-labelledby="subtitle-text">
			<h3 id="subtitle-text" class="text-lg font-bold">Text</h3>
			<div class="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2">
				{@render field("Size", sizes, style.size, (value) =>
					save({
						size: choose(sizes, value),
					}),
				)}
				{@render field("Edge Style", edges, style.edge, (value) =>
					save({
						edge: choose(edges, value),
					}),
				)}
			</div>
		</section>

		<section aria-labelledby="subtitle-background">
			<h3 id="subtitle-background" class="text-lg font-bold">Background</h3>
			<div class="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2">
				{@render field("Opacity", opacities, style.background_opacity, (value) =>
					save({
						background_opacity: choose(opacities, value),
					}),
				)}
			</div>
		</section>

		<div class="flex justify-center">
			<Button variant="secondary" loading={resetting} disabled={resetting} onclick={reset}>
				Reset to Default
			</Button>
		</div>
	{/if}
</Panel>
