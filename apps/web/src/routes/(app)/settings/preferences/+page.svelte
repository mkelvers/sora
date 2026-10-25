<script lang="ts">
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Switch from "$lib/components/ui/Switch.svelte";
	import {
		getPlaybackPreferences,
		savePlaybackPreferences,
	} from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";

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

	let saved = $state(false);

	async function save(changes: Parameters<typeof savePlaybackPreferences>[0]) {
		await savePlaybackPreferences(changes);
		saved = true;
	}
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

		{#if preferences.current}
			<div class="mt-10 space-y-8">
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
					class="text-sm [&_input:checked+span]:after:border-accent [&_input:checked+span]:after:text-accent"
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
			</div>
		{/if}
	</div>
</section>
