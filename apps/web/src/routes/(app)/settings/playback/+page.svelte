<script lang="ts">
	import { page } from "$app/state";
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

	const playback = getPlaybackPreferences();
	const profile = getProfilePreferences();

	let saved = $state(false);

	const savePlayback = async (changes: Parameters<typeof savePlaybackPreferences>[0]) => {
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
	description="How episodes play and appear for {page.data.viewer.profile.name}."
>
	{#if playback.current && profile.current}
		<Row
			label="Preferred Audio"
			stacked
			description="The version Sora plays first when an episode offers it. You can still switch in the player."
		>
			<Select
				variant="field"
				label="Preferred audio"
				options={playback.current.audio === "raw"
					? [...audios, { value: "raw", label: "Raw" }]
					: audios}
				class="w-full sm:w-36"
				bind:value={
					() => playback.current?.audio ?? "dub",
					(value) =>
						savePlayback({
							audio: value,
						})
				}
			/>
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
					checked={playback.current?.auto_skip ?? false}
					onchange={(event) => savePlayback({ auto_skip: event.currentTarget.checked })}
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
					checked={playback.current?.autoplay_next ?? true}
					onchange={(event) => savePlayback({ autoplay_next: event.currentTarget.checked })}
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
					checked={profile.current.hide_spoilers}
					onchange={(event) => saveProfile({ hide_spoilers: event.currentTarget.checked })}
				/>
			{/snippet}
		</Row>
	{/if}
</Panel>
