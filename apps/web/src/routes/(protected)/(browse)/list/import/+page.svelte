<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { importAniList } from "./import.remote";

	const summary = $derived(importAniList.result);
</script>

<svelte:head>
	<title>Import from AniList · Sora</title>
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
	<div class="mx-auto w-full max-w-2xl px-5 py-9 sm:px-10 sm:py-11 lg:py-14">
		<a href="/list" class="text-xs font-bold text-muted uppercase hover:text-foreground">Watchlist</a>
		<h1 class="mt-3 text-2xl font-semibold">Import from AniList</h1>
		<p class="mt-4 text-sm leading-6 text-muted sm:text-base sm:leading-7">
			Everything on your AniList anime list joins your watchlist, and the episodes you’ve watched there become
			your history here, so each title shows as watching, completed, or planned from what you’ve actually seen.
			Titles you dropped stay dropped. Your list needs to be public.
		</p>

		<form class="mt-10" {...importAniList}>
			<label for="user-name" class="text-sm text-muted">AniList user name</label>
			<div class="mt-2 flex gap-2">
				<Input
					id="user-name"
					autocomplete="username"
					spellcheck="false"
					class="h-11"
					{...importAniList.fields.userName.as("text")}
				/>
				<Button
					type="submit"
					class="min-h-11 bg-accent px-6 text-xs font-bold text-on-accent uppercase hover:brightness-110"
					disabled={importAniList.pending > 0}
				>
					{importAniList.pending > 0 ? "Importing…" : "Import"}
				</Button>
			</div>

			{#each importAniList.fields.userName.issues() ?? [] as issue (issue.message)}
				<p class="mt-2 text-sm text-status-error">{issue.message}</p>
			{/each}
		</form>

		{#if summary}
			<div class="mt-8 grid gap-2 bg-surface p-5 text-sm" role="status">
				<p>
					Imported {summary.entries}
					{summary.entries === 1 ? "title" : "titles"} and {summary.episodes}
					{summary.episodes === 1 ? "watched episode" : "watched episodes"}.
				</p>
				{#if summary.preparing > 0}
					<p class="text-muted">
						{summary.preparing}
						{summary.preparing === 1 ? "title is" : "titles are"} still being prepared and will join your watchlist as they’re ready.
					</p>
				{/if}
				<a href="/list" class="mt-2 text-xs font-bold text-accent uppercase">Go to your watchlist</a>
			</div>
		{/if}
	</div>
</main>
