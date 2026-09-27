<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { importAniList } from "./import.remote";

	const summary = $derived(importAniList.result);
</script>

<svelte:head>
	<title>Import from AniList</title>
</svelte:head>

<div class="page">
	<a class="back" href="/list">Watchlist</a>

	<h1>Import from AniList</h1>
	<p class="lead">
		Everything on your AniList anime list joins your watchlist, and the
		episodes you’ve watched there become your history here, so each title
		shows as watching, completed, or planned from what you’ve actually seen.
		Titles you dropped stay dropped. Your list needs to be public.
	</p>

	<form {...importAniList}>
		<label for="user-name">AniList user name</label>
		<div class="row">
			<input
				id="user-name"
				autocomplete="username"
				spellcheck="false"
				{...importAniList.fields.userName.as("text")}
			/>
			<Button type="submit" class="submit" disabled={importAniList.pending > 0}>
				{importAniList.pending > 0 ? "Importing…" : "Import"}
			</Button>
		</div>

		{#each importAniList.fields.userName.issues() ?? [] as issue (issue.message)}
			<p class="issue">{issue.message}</p>
		{/each}
	</form>

	{#if summary}
		<div class="done" role="status">
			<p>
				Imported {summary.entries}
				{summary.entries === 1 ? "title" : "titles"} and
				{summary.episodes}
				{summary.episodes === 1 ? "watched episode" : "watched episodes"}.
			</p>
			{#if summary.preparing > 0}
				<p>
					{summary.preparing}
					{summary.preparing === 1 ? "title is" : "titles are"} still being
					prepared and will join your watchlist as they’re ready.
				</p>
			{/if}
			<a href="/list">Go to your watchlist</a>
		</div>
	{/if}
</div>

<style>
	.page {
		--side: clamp(16px, 3.3vw, 64px);

		display: grid;
		align-content: start;
		gap: 20px;
		max-width: 640px;
		padding: 32px var(--side) 80px;
	}

	.back {
		color: #999;
		font-size: 14px;
	}

	.back:hover {
		color: #fff;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.lead {
		margin: 0;
		color: #aaa;
		font-size: 15px;
		line-height: 1.6;
	}

	form {
		display: grid;
		gap: 8px;
	}

	label {
		color: #ccc;
		font-size: 14px;
	}

	.row {
		display: flex;
		gap: 8px;
	}

	input {
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 14px;
		border: 1px solid #333;
		background: #1a1a1a;
		color: #fff;
		font: inherit;
		font-size: 15px;
		outline: none;
	}

	input:focus-visible {
		border-color: #fff;
	}

	.row :global(.submit) {
		height: 44px;
		padding: 0 22px;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}

	.issue {
		margin: 0;
		color: #ff8a80;
		font-size: 14px;
	}

	.done {
		display: grid;
		gap: 8px;
		padding: 16px;
		background: #1a1a1a;
	}

	.done p {
		margin: 0;
		color: #ddd;
		font-size: 15px;
	}

	.done a {
		color: #fff;
		font-size: 14px;
	}
</style>
