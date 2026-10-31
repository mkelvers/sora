<script lang="ts">
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Select from "$lib/components/ui/select.svelte";
	import Switch from "$lib/components/ui/switch.svelte";
	import {
		getPlaybackPreferences,
		savePlaybackPreferences,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
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

	const preferences = getPlaybackPreferences();
	const profile = getProfilePreferences();

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
	<title>Preferences - Settings - Sora</title>
</svelte:head>

<StatusBanner message={saved ? "Preferences saved." : ""} ondismiss={() => (saved = false)} />

{#snippet setting(
	label: string,
	description: string,
	checked: boolean,
	change: (value: boolean) => void,
)}
	<div>
		<Switch
			icons
			class="text-sm font-bold"
			{checked}
			onchange={(event) => change(event.currentTarget.checked)}
		>
			{label}
		</Switch>
		<p class="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
	</div>
{/snippet}

<section class="bg-raised px-6 py-14 sm:px-12 sm:py-20" aria-labelledby="preferences">
	<div class="mx-auto max-w-lg">
		<h2 id="preferences" class="text-center text-2xl font-bold">Preferences</h2>
		<p class="mt-3 text-center text-sm text-muted">
			Choose how Sora plays, hides and tells you things for {page.data.viewer.profile.name}.
		</p>

		{#if preferences.current && profile.current}
			<div class="mt-12 space-y-12">
				<div class="space-y-6">
					<h3 class="text-lg font-bold">Playback</h3>
					<div>
						<p class="text-xs font-bold text-subtle">Preferred Audio</p>
						<Select
							variant="field"
							label="Preferred audio"
							options={preferences.current.audio === "raw"
								? [...audios, { value: "raw", label: "Raw" }]
								: audios}
							class="mt-2 h-11 border-0 border-b border-border px-0 text-base font-medium hover:border-border hover:text-accent-secondary aria-expanded:border-border aria-expanded:text-accent-secondary"
							bind:value={
								() => preferences.current?.audio ?? "dub",
								(value) =>
									save({
										audio: value,
									})
							}
						/>
						<p class="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
							The version Sora plays first when an episode offers it. You can still switch in the
							player.
						</p>
					</div>

					{@render setting(
						"Skip Openings and Endings",
						"Skip them without asking, when Sora knows where they are.",
						preferences.current.auto_skip,
						(value) => save({ auto_skip: value }),
					)}
					{@render setting(
						"Play the Next Episode Automatically",
						"Start the next episode when one ends. Turn this off to stop at the end instead.",
						preferences.current.autoplay_next,
						(value) => save({ autoplay_next: value }),
					)}
				</div>

				<div class="space-y-6">
					<h3 class="text-lg font-bold">Episodes</h3>
					{@render setting(
						"Hide Spoilers in Episode Lists",
						"Hide the title, picture and summary of episodes you haven't started. Watched episodes stay as they are.",
						profile.current.hide_spoilers,
						(value) => saveProfile({ hide_spoilers: value }),
					)}
				</div>

				<div class="space-y-6">
					<div>
						<h3 class="text-lg font-bold">Notifications</h3>
						<p class="mt-1.5 text-xs leading-relaxed text-muted">
							For titles on your Watchlist and ones you've watched. Turn all three off to mute them.
						</p>
					</div>
					{@render setting(
						"New Seasons and Films",
						"A new season or film of a title you follow comes out.",
						profile.current.notifications.premieres,
						(value) => saveProfile({ notifications: { premieres: value } }),
					)}
					{@render setting(
						"New Episodes",
						"New episodes of a title you follow come out.",
						profile.current.notifications.episodes,
						(value) => saveProfile({ notifications: { episodes: value } }),
					)}
					{@render setting(
						"English Dubs",
						"An English dub of a title you follow comes out.",
						profile.current.notifications.dubs,
						(value) => saveProfile({ notifications: { dubs: value } }),
					)}
				</div>
			</div>
		{/if}
	</div>
</section>
