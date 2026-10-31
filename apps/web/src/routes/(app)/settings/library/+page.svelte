<script lang="ts">
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Field from "$lib/components/ui/field.svelte";
	import Select from "$lib/components/ui/select.svelte";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import Row from "$routes/(app)/settings/components/row.svelte";
	import type { LibraryImportReport } from "@sora/sdk";
	import { attempt } from "@sora/shared";

	import { importLibrary } from "../library.remote";

	const sources = [
		{
			description: "A file you exported from Sora, here or on another install.",
			label: "Sora file",
			value: "sora",
		},
		{
			description:
				"Reads your public anime list. Make the list public in AniList's settings first.",
			label: "AniList",
			value: "anilist",
		},
		{
			description:
				"On MyAnimeList, open Profile, then Export, and choose the file here. Zipped or not.",
			label: "MyAnimeList",
			value: "myanimelist",
		},
	] as const;

	const maxFileBytes = 20_000_000;

	let source = $state<(typeof sources)[number]["value"]>("anilist");
	let username = $state("");
	let busy = $state(false);
	let report = $state<LibraryImportReport | null>(null);
	let problem = $state("");
	let file = $state<HTMLInputElement>();

	const described = $derived(sources.find((option) => option.value === source));

	const run = async (input: Parameters<typeof importLibrary>[0]) => {
		busy = true;
		problem = "";
		report = null;
		const { data, error } = await attempt(importLibrary(input), Error);
		busy = false;
		if (error) {
			problem =
				source === "anilist"
					? "That AniList user doesn't exist or keeps their list private."
					: "That file couldn't be imported. Check it's the right one and try again.";
			return;
		}

		report = data;
	};

	const readText = async (chosen: File) =>
		chosen.name.endsWith(".gz")
			? await new Response(chosen.stream().pipeThrough(new DecompressionStream("gzip"))).text()
			: await chosen.text();

	const chooseFile = async () => {
		const chosen = file?.files?.[0];
		if (file) {
			file.value = "";
		}
		if (!chosen) {
			return;
		}
		if (chosen.size > maxFileBytes) {
			problem = "That file is too large to import. The limit is 20 MB.";
			report = null;
			return;
		}

		const { data: text, error } = await attempt(readText(chosen), Error);
		if (error) {
			problem = "That file couldn't be read.";
			report = null;
			return;
		}
		if (source === "myanimelist") {
			await run({ source: "myanimelist", xml: text });
			return;
		}

		const { data: document, error: syntax } = attempt(() => JSON.parse(text), SyntaxError);
		if (syntax) {
			problem = "That isn't a Sora export file.";
			report = null;
			return;
		}

		await run({ document, source: "sora" });
	};

	const count = (number: number, noun: string) =>
		`${number.toLocaleString("en-US")} ${noun}${number === 1 ? "" : "s"}`;
</script>

<svelte:head>
	<title>Import and Export - Settings - Sora</title>
</svelte:head>

<StatusBanner message={report ? "Import finished." : ""} ondismiss={() => (report = null)} />

<Panel
	title="Import and Export"
	description="Take your Watchlist and history with you, or bring them in from somewhere else."
>
	<Row
		label="Export"
		description="Download your Watchlist and everything you've watched as one file."
	>
		<Button
			variant="secondary"
			size="sm"
			href="/settings/library/export"
			download
			data-sveltekit-reload
		>
			Download
		</Button>
	</Row>

	<div>
		<p class="text-base leading-6 font-semibold">Import</p>
		<p class="mt-1 text-sm leading-relaxed text-muted">
			Adds to what you have. A title already on your Watchlist keeps its status, and episodes you've
			watched stay as they are.
		</p>

		<div class="mt-6">
			<p class="text-xs text-subtle">Import from</p>
			<Select
				variant="field"
				label="Import from"
				options={sources}
				class="mt-2 h-10 border-0 border-b border-border px-0 text-base font-medium hover:border-border hover:text-accent-secondary aria-expanded:border-border aria-expanded:text-accent-secondary"
				bind:value={source}
			/>
			<p class="mt-2 text-sm leading-relaxed text-muted">{described?.description}</p>
		</div>

		{#if source === "anilist"}
			<form
				class="mt-6"
				onsubmit={(event) => {
					event.preventDefault();
					run({ source: "anilist", username });
				}}
			>
				<Field name="anilist-username" label="AniList username" bind:value={username} required />
				<Button type="submit" variant="primary" class="mt-6 w-full" loading={busy}>Import</Button>
			</form>
		{:else}
			<input
				bind:this={file}
				type="file"
				class="sr-only"
				accept={source === "sora"
					? ".json,application/json"
					: ".xml,.gz,application/xml,application/gzip"}
				tabindex="-1"
				aria-hidden="true"
				onchange={chooseFile}
			/>
			<Button variant="primary" class="mt-6 w-full" loading={busy} onclick={() => file?.click()}>
				Choose File
			</Button>
		{/if}

		{#if problem}
			<p class="mt-4 text-sm text-danger" role="alert">{problem}</p>
		{/if}
	</div>

	{#if report}
		<div aria-live="polite">
			<p class="text-base leading-6 font-semibold">Import finished</p>
			<p class="mt-1 text-sm leading-relaxed text-muted">
				Added {count(report.watchlist_added, "title")} to your Watchlist and marked
				{count(report.episodes_added, "episode")} watched.
				{#if report.watchlist_kept}
					{count(report.watchlist_kept, "title")} already on your Watchlist stayed as they were.
				{/if}
			</p>
			{#if report.not_in_sora_count}
				<p class="mt-3 text-sm leading-relaxed text-muted">
					{count(report.not_in_sora_count, "title")}
					{report.not_in_sora_count === 1 ? "isn't" : "aren't"} in Sora yet.
					{#if report.not_in_sora.some((title) => title.anilist_id !== null)}
						They're being added, so import again later to take them.
					{/if}
				</p>
				<details class="mt-2 text-sm text-muted">
					<summary class="cursor-pointer hover:text-foreground">Show titles</summary>
					<ul class="mt-2 space-y-1">
						{#each report.not_in_sora as title, index (index)}
							<li>{title.title ?? `AniList ${title.anilist_id}`}</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/if}
</Panel>
