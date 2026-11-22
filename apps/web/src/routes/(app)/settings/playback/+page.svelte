<script lang="ts">
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Select from "$lib/components/ui/select.svelte";
	import Switch from "$lib/components/ui/switch.svelte";
	import {
		getPlaybackPreferences,
		savePlaybackPreferences,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import Row from "$routes/(app)/settings/components/row.svelte";
	import {
		getProfilePreferences,
		saveProfilePreferences,
	} from "$routes/(app)/settings/settings.remote";

	const audios = [
		{
			label: "Dubbed",
			value: "dub",
		},
		{
			label: "Subtitled",
			value: "sub",
		},
	] as const;

	const [playback, profile] = $derived(
		await Promise.all([getPlaybackPreferences(), getProfilePreferences()]),
	);

	let saved = $state(false);

	const save = async (changes: Parameters<typeof savePlaybackPreferences>[0]) => {
		await savePlaybackPreferences(changes);
		saved = true;
	};

	const saveProfile = async (changes: Parameters<typeof saveProfilePreferences>[0]) => {
		await saveProfilePreferences(changes);
		saved = true;
	};
</script>

<svelte:head>
	<title>Playback - Settings - Sora</title>
</svelte:head>

<StatusBanner message={saved ? "Playback settings saved." : ""} ondismiss={() => (saved = false)} />

<Panel
	title="Playback"
	description="Which version plays first, what gets skipped, what plays next, and what episode lists hide."
>
	<div>
		<p class="text-xs text-subtle">Preferred Audio</p>
		<Select
			variant="field"
			label="Preferred Audio"
			options={playback.audio === "raw" ? [...audios, { value: "raw", label: "Raw" }] : audios}
			class="mt-2 h-10 border-0 border-b border-border px-0 text-base font-medium hover:border-border hover:text-accent-secondary aria-expanded:border-border aria-expanded:text-accent-secondary"
			bind:value={
				() => playback.audio ?? "dub",
				(value) =>
					save({
						audio: value,
					})
			}
		/>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			The version Sora plays first when an episode offers it. You can still switch in the player.
		</p>
	</div>

	<Row label="Prefer Closed Captions" controlId="closed-captions">
		{#snippet description()}
			Show closed captions on dubs automatically when they're available.
			<a
				href="/settings/playback/subtitles"
				class="text-accent transition-colors hover:text-foreground focus-visible:text-foreground"
			>
				Change Subtitle Appearance
			</a>
		{/snippet}
		{#snippet children({ describedby })}
			<Switch
				id="closed-captions"
				icons
				aria-describedby={describedby}
				checked={playback.subtitles.dub !== null}
				onchange={(event) =>
					save({
						subtitles: {
							dub: event.currentTarget.checked
								? {
										kind: "captions",
										language: "en",
									}
								: null,
						},
					})}
			/>
		{/snippet}
	</Row>

	<Row
		label="Skip Openings and Endings"
		description="Skip them without asking, when Sora knows where they are."
		controlId="skip-segments"
	>
		{#snippet children({ describedby })}
			<Switch
				id="skip-segments"
				icons
				aria-describedby={describedby}
				checked={playback.auto_skip}
				onchange={(event) => save({ auto_skip: event.currentTarget.checked })}
			/>
		{/snippet}
	</Row>

	<Row
		label="Play the Next Episode Automatically"
		description="Start the next episode when one ends. Turn this off to stop at the end instead."
		controlId="autoplay-next"
	>
		{#snippet children({ describedby })}
			<Switch
				id="autoplay-next"
				icons
				aria-describedby={describedby}
				checked={playback.autoplay_next}
				onchange={(event) => save({ autoplay_next: event.currentTarget.checked })}
			/>
		{/snippet}
	</Row>

	<Row
		label="Hide Spoilers in Episode Lists"
		description="Hide the title, picture and summary of episodes you haven't started. Watched episodes stay as they are."
		controlId="hide-spoilers"
	>
		{#snippet children({ describedby })}
			<Switch
				id="hide-spoilers"
				icons
				aria-describedby={describedby}
				checked={profile.hide_spoilers}
				onchange={(event) => saveProfile({ hide_spoilers: event.currentTarget.checked })}
			/>
		{/snippet}
	</Row>
</Panel>
