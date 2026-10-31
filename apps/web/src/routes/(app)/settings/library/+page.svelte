<script lang="ts">
	import anilist from "$lib/assets/providers/anilist.svg";
	import myanimelist from "$lib/assets/providers/myanimelist.svg";
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import Row from "$routes/(app)/settings/components/row.svelte";
	import type { LibraryImportReport } from "@sora/sdk";
	import { attempt } from "@sora/shared";

	import { authorizeImport, getImportOptions, importLibrary } from "../library.remote";
	import { begin, returnedFrom } from "./connection";
	import type { AccountSource } from "./connection";

	/** The sites a list can be connected from, with their marks on their own colours. */
	const catalogue = [
		{
			color: "#02a9ff",
			icon: anilist,
			id: "anilist_account",
			name: "AniList",
		},
		{
			color: "#2e51a2",
			icon: myanimelist,
			id: "myanimelist_account",
			name: "MyAnimeList",
		},
	] as const;

	const maxFileBytes = 20_000_000;

	const options = getImportOptions();

	let picked = $state<AccountSource | null>(null);
	let busy = $state<"connect" | "import" | "file" | null>(null);
	let report = $state<LibraryImportReport | null>(null);
	let announced = $state(false);
	let problem = $state("");
	let fileInput = $state<HTMLInputElement>();

	const ready = $derived(options.current !== undefined);
	const providers = $derived(
		catalogue.filter((provider) => options.current?.[provider.id] === true),
	);
	const selected = $derived(
		providers.find((provider) => provider.id === picked) ?? providers.at(0),
	);

	const redirectUri = () => `${location.origin}${location.pathname}`;

	const run = async (input: Parameters<typeof importLibrary>[0], kind: "import" | "file") => {
		busy = kind;
		problem = "";
		report = null;
		const { data, error } = await attempt(importLibrary(input), Error);
		busy = null;
		if (error) {
			problem =
				kind === "import"
					? "That couldn't be imported. Connect again and it should work."
					: "That file couldn't be imported. Check it's the right one and try again.";
			return;
		}

		report = data;
		announced = true;
	};

	const connect = async () => {
		if (!selected) {
			return;
		}

		busy = "connect";
		problem = "";
		const { challenge, state } = begin(selected.id);
		const { data, error } = await attempt(
			authorizeImport({
				code_challenge: challenge,
				redirect_uri: redirectUri(),
				source: selected.id,
				state,
			}),
			Error,
		);
		if (error) {
			busy = null;
			problem = `Connecting to ${selected.name} isn't available right now.`;
			return;
		}

		location.href = data.url;
	};

	$effect(() => {
		const returned = returnedFrom(location.search);
		if (!returned) {
			return;
		}

		history.replaceState(history.state, "", location.pathname);
		if (returned.kind === "refused") {
			problem = "You didn't agree, so nothing was imported.";
		} else if (returned.kind === "unknown") {
			problem = "That connection couldn't be checked. Try connecting again.";
		} else {
			run(
				{
					authorization: {
						code: returned.code,
						code_verifier: returned.verifier,
						redirect_uri: redirectUri(),
					},
					source: returned.source,
				},
				"import",
			);
		}
	});

	const readText = async (chosen: File) =>
		chosen.name.endsWith(".gz")
			? await new Response(chosen.stream().pipeThrough(new DecompressionStream("gzip"))).text()
			: await chosen.text();

	/** Imports a file whatever it is: a MyAnimeList export is XML, one downloaded from Export is JSON. */
	const chooseFile = async () => {
		const chosen = fileInput?.files?.[0];
		if (fileInput) {
			fileInput.value = "";
		}
		if (!chosen) {
			return;
		}

		problem = "";
		report = null;
		if (chosen.size > maxFileBytes) {
			problem = "That file is too large to import. The limit is 20 MB.";
			return;
		}

		const { data: text, error } = await attempt(readText(chosen), Error);
		if (error) {
			problem = "That file couldn't be read.";
			return;
		}

		const start = text.trimStart().charAt(0);
		if (start === "<") {
			await run({ source: "myanimelist", xml: text }, "file");
			return;
		}

		const { data: document, error: syntax } = attempt(() => JSON.parse(text), SyntaxError);
		if (start !== "{" || syntax) {
			problem = "That isn't a MyAnimeList export or a file downloaded from Export.";
			return;
		}

		await run({ document, source: "sora" }, "file");
	};

	const count = (number: number, noun: string) =>
		`${number.toLocaleString("en-US")} ${noun}${number === 1 ? "" : "s"}`;
</script>

<svelte:head>
	<title>Import and Export - Settings - Sora</title>
</svelte:head>

<StatusBanner message={announced ? "Import finished." : ""} ondismiss={() => (announced = false)} />

<Panel
	title="Import and Export"
	description="Take your Watchlist and history with you, or bring them in from somewhere else."
>
	<section class="space-y-6" aria-labelledby="import-heading">
		<div>
			<h3 id="import-heading" class="text-lg font-bold">Import</h3>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				{#if providers.length}
					Sign in to the site you keep your list on and Sora brings it over. It only adds to what
					you have: a title already on your Watchlist keeps its status, and episodes you've watched
					stay as they are.
				{:else}
					It only adds to what you have: a title already on your Watchlist keeps its status, and
					episodes you've watched stay as they are.
				{/if}
			</p>
		</div>

		{#if !ready}
			<div class="grid grid-cols-2 gap-4" aria-hidden="true">
				<Skeleton class="h-20" />
				<Skeleton class="h-20" />
			</div>
		{:else if providers.length}
			<fieldset class="grid gap-4 border-0 p-0 sm:grid-cols-2">
				<legend class="sr-only">Import from</legend>
				{#each providers as provider (provider.id)}
					<label
						class="flex cursor-pointer items-center gap-4 border-2 border-border bg-surface p-4 transition-colors has-checked:border-accent-secondary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
					>
						<input
							type="radio"
							name="provider"
							class="peer sr-only"
							value={provider.id}
							checked={selected?.id === provider.id}
							onchange={() => (picked = provider.id)}
						/>
						<span
							class="grid size-11 shrink-0 place-items-center"
							style:background-color={provider.color}
						>
							<img src={provider.icon} alt="" class="size-6" />
						</span>
						<span class="text-base font-semibold">{provider.name}</span>
					</label>
				{/each}
			</fieldset>

			<div class="space-y-3">
				<Button
					variant="primary"
					class="w-full"
					loading={busy === "connect" || busy === "import"}
					disabled={busy !== null}
					onclick={connect}
				>
					Connect {selected?.name}
				</Button>
				<p class="text-sm text-muted" aria-live="polite">
					{#if busy === "import"}
						Reading your list from {selected?.name}. This can take a moment.
					{:else}
						You'll sign in on {selected?.name} and come straight back.
					{/if}
				</p>
			</div>
		{/if}

		{#if ready}
			<Row
				label="Import From File"
				description="A MyAnimeList export, or a file you downloaded from Export."
			>
				<Button
					variant="secondary"
					size="sm"
					loading={busy === "file"}
					disabled={busy !== null}
					onclick={() => fileInput?.click()}
				>
					Choose File
				</Button>
				<input
					bind:this={fileInput}
					type="file"
					class="sr-only"
					accept=".json,.xml,.gz,application/json,application/xml,application/gzip"
					tabindex="-1"
					aria-hidden="true"
					onchange={chooseFile}
				/>
			</Row>
		{/if}

		{#if problem}
			<p class="text-sm text-danger" role="alert">{problem}</p>
		{/if}

		{#if report}
			<div class="bg-surface p-6" aria-live="polite">
				<p class="text-base font-semibold">Import finished</p>
				<dl class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-6">
					<div>
						<dt class="text-sm text-muted">Added to Watchlist</dt>
						<dd class="mt-1 text-2xl font-bold tabular-nums">
							{report.watchlist_added.toLocaleString("en-US")}
						</dd>
					</div>
					<div>
						<dt class="text-sm text-muted">Episodes marked</dt>
						<dd class="mt-1 text-2xl font-bold tabular-nums">
							{report.episodes_added.toLocaleString("en-US")}
						</dd>
					</div>
					{#if report.not_in_sora_count}
						<div>
							<dt class="text-sm text-muted">Not in Sora yet</dt>
							<dd class="mt-1 text-2xl font-bold tabular-nums">
								{report.not_in_sora_count.toLocaleString("en-US")}
							</dd>
						</div>
					{/if}
				</dl>
				{#if report.watchlist_kept}
					<p class="mt-5 text-sm leading-relaxed text-muted">
						{count(report.watchlist_kept, "title")} already on your Watchlist stayed as
						{report.watchlist_kept === 1 ? "it was" : "they were"}.
					</p>
				{/if}
				{#if report.not_in_sora_count}
					<p class="mt-3 text-sm leading-relaxed text-muted">
						{#if report.not_in_sora.some((title) => title.anilist_id !== null)}
							Sora is adding them. Import again later to take them.
						{:else}
							Sora can't match them to AniList yet.
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
	</section>

	<section class="space-y-6" aria-labelledby="export-heading">
		<h3 id="export-heading" class="text-lg font-bold">Export</h3>
		<Row
			label="Watchlist and History"
			description="Everything you've saved and watched, as one file you can import again anywhere."
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
	</section>
</Panel>
