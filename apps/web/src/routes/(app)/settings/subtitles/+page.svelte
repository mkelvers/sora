<script lang="ts">
	import Cue from "$lib/components/cue.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Select from "$lib/components/ui/select.svelte";
	import {
		getPlaybackPreferences,
		savePlaybackPreferences,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import type { SubtitleStyle } from "@sora/sdk";
	import { attempt } from "@sora/shared";

	interface Choice<T extends string | number> {
		label: string;
		value: T;
	}

	const positions: Choice<SubtitleStyle["position"]>[] = [
		{
			label: "Bottom",
			value: "bottom",
		},
		{
			label: "Top",
			value: "top",
		},
	];

	const sizes: Choice<SubtitleStyle["size"]>[] = [
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
		{
			label: "150%",
			value: 150,
		},
		{
			label: "200%",
			value: 200,
		},
	];

	const colors: Choice<SubtitleStyle["text_color"]>[] = [
		{
			label: "White",
			value: "white",
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
			label: "Green",
			value: "green",
		},
		{
			label: "Magenta",
			value: "magenta",
		},
		{
			label: "Red",
			value: "red",
		},
		{
			label: "Blue",
			value: "blue",
		},
		{
			label: "Black",
			value: "black",
		},
	];

	const textOpacities: Choice<SubtitleStyle["text_opacity"]>[] = [
		{
			label: "100%",
			value: 100,
		},
		{
			label: "75%",
			value: 75,
		},
		{
			label: "50%",
			value: 50,
		},
		{
			label: "25%",
			value: 25,
		},
	];

	const edges: Choice<SubtitleStyle["edge"]>[] = [
		{
			label: "Outline",
			value: "outline",
		},
		{
			label: "Drop shadow",
			value: "shadow",
		},
		{
			label: "None",
			value: "none",
		},
	];

	const backgroundOpacities: Choice<SubtitleStyle["background_opacity"]>[] = [
		{
			label: "None",
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

	let saved = $state(false);
	let failure = $state("");

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
		saved = !error;
		failure = error ? "Your subtitle settings couldn’t be saved." : "";
	};
</script>

<svelte:head>
	<title>Subtitles - Settings - Sora</title>
</svelte:head>

<StatusBanner message={saved ? "Subtitle settings saved." : ""} ondismiss={() => (saved = false)} />
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

<Panel
	title="Subtitles"
	description="Where subtitles sit and how they look over the picture. Subtitles burned into the video keep their own look."
>
	{#if playback.current}
		{@const style = playback.current.subtitle_style}

		<figure class="@container" aria-label="Subtitle preview">
			<div
				class="grid aspect-[5/2] grid-cols-1 grid-rows-1 overflow-hidden bg-[linear-gradient(160deg,#f2e3c6_0%,#9fb4c7_45%,#2b3a4f_100%)] px-[4cqw] text-[4cqw] text-white"
			>
				<div
					class={[
						"flex flex-col items-center",
						style.position === "top" ? "mt-[4cqw] self-start" : "mb-[4cqw] self-end",
					]}
				>
					<Cue appearance={style}>Subtitles will look like this.</Cue>
				</div>
			</div>
		</figure>

		<div class="grid gap-x-8 gap-y-10 sm:grid-cols-2">
			{@render field("Position", positions, style.position, (value) =>
				save({
					position: choose(positions, value),
				}),
			)}
			{@render field("Text size", sizes, style.size, (value) =>
				save({
					size: choose(sizes, value),
				}),
			)}
			{@render field("Text colour", colors, style.text_color, (value) =>
				save({
					text_color: choose(colors, value),
				}),
			)}
			{@render field("Text opacity", textOpacities, style.text_opacity, (value) =>
				save({
					text_opacity: choose(textOpacities, value),
				}),
			)}
			{@render field("Character edge", edges, style.edge, (value) =>
				save({
					edge: choose(edges, value),
				}),
			)}
			{@render field("Background colour", colors, style.background_color, (value) =>
				save({
					background_color: choose(colors, value),
				}),
			)}
			{@render field("Background opacity", backgroundOpacities, style.background_opacity, (value) =>
				save({
					background_opacity: choose(backgroundOpacities, value),
				}),
			)}
		</div>
	{/if}
</Panel>
