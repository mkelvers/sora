<script lang="ts">
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Switch from "$lib/components/ui/switch.svelte";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import Row from "$routes/(app)/settings/components/row.svelte";
	import {
		getProfilePreferences,
		saveProfilePreferences,
	} from "$routes/(app)/settings/settings.remote";

	const profile = getProfilePreferences();

	let saved = $state(false);

	const save = async (changes: Parameters<typeof saveProfilePreferences>[0]) => {
		await saveProfilePreferences(changes);
		saved = true;
	};
</script>

<svelte:head>
	<title>Notifications - Settings - Sora</title>
</svelte:head>

<StatusBanner
	message={saved ? "Notification settings saved." : ""}
	ondismiss={() => (saved = false)}
/>

<Panel
	title="Notifications"
	description="Which releases of titles on your Watchlist, and ones you've watched, notify you. Turn all three off to mute them."
>
	{#if profile.current}
		<Row
			label="New Seasons and Films"
			description="A new season or film of a title you follow comes out."
			controlId="notify-premieres"
		>
			{#snippet children({ describedby })}
				<Switch
					id="notify-premieres"
					icons
					aria-describedby={describedby}
					checked={profile.current?.notifications.premieres ?? true}
					onchange={(event) => save({ notifications: { premieres: event.currentTarget.checked } })}
				/>
			{/snippet}
		</Row>

		<Row
			label="New Episodes"
			description="New episodes of a title you follow come out."
			controlId="notify-episodes"
		>
			{#snippet children({ describedby })}
				<Switch
					id="notify-episodes"
					icons
					aria-describedby={describedby}
					checked={profile.current?.notifications.episodes ?? true}
					onchange={(event) => save({ notifications: { episodes: event.currentTarget.checked } })}
				/>
			{/snippet}
		</Row>

		<Row
			label="English Dubs"
			description="An English dub of a title you follow comes out."
			controlId="notify-dubs"
		>
			{#snippet children({ describedby })}
				<Switch
					id="notify-dubs"
					icons
					aria-describedby={describedby}
					checked={profile.current?.notifications.dubs ?? true}
					onchange={(event) => save({ notifications: { dubs: event.currentTarget.checked } })}
				/>
			{/snippet}
		</Row>
	{/if}
</Panel>
