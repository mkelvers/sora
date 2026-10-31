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

	const toggle =
		"text-sm [&_input:checked+span]:after:border-accent [&_input:checked+span]:after:text-accent";
</script>

<svelte:head>
	<title>Preferences - Settings - Sora</title>
</svelte:head>

<StatusBanner message={saved ? "Preferences saved." : ""} ondismiss={() => (saved = false)} />

<section class="bg-raised px-5 py-12 sm:py-16" aria-labelledby="preferences">
	<div class="mx-auto max-w-sm">
		<h2 id="preferences" class="text-center text-2xl font-bold">Preferences</h2>
		<p class="mt-3 text-center text-sm text-muted">
			How episodes play for {page.data.viewer.profile.name}.
		</p>

		{#if preferences.current && profile.current}
			<div class="mt-10 space-y-10">
				<div class="space-y-8">
					<h3 class="text-lg font-bold">Playback</h3>
					<div>
						<p class="text-xs text-subtle">Preferred audio</p>
						<Select
							variant="field"
							label="Preferred audio"
							options={preferences.current.audio === "raw"
								? [...audios, { value: "raw", label: "Raw" }]
								: audios}
							class="mt-2 h-10 border-0 border-b border-border px-0 text-base font-medium hover:border-border hover:text-accent-secondary aria-expanded:border-border aria-expanded:text-accent-secondary"
							bind:value={
								() => preferences.current?.audio ?? "dub",
								(value) =>
									save({
										audio: value,
									})
							}
						/>
					</div>

					<Switch
						class={toggle}
						bind:checked={
							() => preferences.current?.auto_skip ?? false,
							(value) =>
								save({
									auto_skip: value,
								})
						}
					>
						Skip openings and endings
					</Switch>

					<Switch
						class={toggle}
						bind:checked={
							() => preferences.current?.autoplay_next ?? true,
							(value) =>
								save({
									autoplay_next: value,
								})
						}
					>
						Play the next episode automatically
					</Switch>
				</div>

				<div class="space-y-8">
					<h3 class="text-lg font-bold">Episodes</h3>
					<Switch
						class={toggle}
						bind:checked={
							() => profile.current?.hide_spoilers ?? false,
							(value) =>
								saveProfile({
									hide_spoilers: value,
								})
						}
					>
						Hide spoilers in episode lists
					</Switch>
				</div>

				<div class="space-y-8">
					<h3 class="text-lg font-bold">Notifications</h3>
					<p class="-mt-4 text-sm text-muted">
						For titles on your Watchlist and ones you've watched.
					</p>
					<Switch
						class={toggle}
						bind:checked={
							() => profile.current?.notifications.premieres ?? true,
							(value) =>
								saveProfile({
									notifications: {
										premieres: value,
									},
								})
						}
					>
						New seasons and films
					</Switch>
					<Switch
						class={toggle}
						bind:checked={
							() => profile.current?.notifications.episodes ?? true,
							(value) =>
								saveProfile({
									notifications: {
										episodes: value,
									},
								})
						}
					>
						New episodes
					</Switch>
					<Switch
						class={toggle}
						bind:checked={
							() => profile.current?.notifications.dubs ?? true,
							(value) =>
								saveProfile({
									notifications: {
										dubs: value,
									},
								})
						}
					>
						English dubs
					</Switch>
				</div>
			</div>
		{/if}
	</div>
</section>
