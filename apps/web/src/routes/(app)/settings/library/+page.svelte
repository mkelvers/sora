<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Field from "$lib/components/ui/field.svelte";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import Row from "$routes/(app)/settings/components/row.svelte";
	import type { LibraryImportReport } from "@sora/sdk";
	import { attempt } from "@sora/shared";

	import { authorizeImport, getImportOptions, importLibrary } from "../library.remote";
	import { begin, returnedFrom } from "./connection";
	import type { AccountSource } from "./connection";

	const maxFileBytes = 20_000_000;

	const options = getImportOptions();

	const accounts = $derived(
		options.current ?? { anilist_account: false, myanimelist_account: false },
	);
	const ready = $derived(options.current !== undefined);

	let busy = $state<string | null>(null);
	let report = $state<LibraryImportReport | null>(null);
	let announced = $state(false);
	let problem = $state("");
	let username = $state("");
	let askingUsername = $state(false);
	let animeListFile = $state<HTMLInputElement>();
	let soraFile = $state<HTMLInputElement>();

	const redirectUri = () => `${location.origin}${location.pathname}`;

	const run = async (source: string, input: Parameters<typeof importLibrary>[0]) => {
		busy = source;
		problem = "";
		report = null;
		const { data, error } = await attempt(importLibrary(input), Error);
		busy = null;
		if (error) {
			problem =
				input.source === "anilist"
					? "That AniList user doesn't exist or keeps their list private."
					: "That couldn't be imported. Connect again, or check the file is the right one.";
			return;
		}

		report = data;
		announced = true;
	};

	const connect = async (source: AccountSource) => {
		busy = source;
		problem = "";
		const { challenge, state } = begin(source);
		const { data, error } = await attempt(
			authorizeImport({
				code_challenge: challenge,
				redirect_uri: redirectUri(),
				source,
				state,
			}),
			Error,
		);
		if (error) {
			busy = null;
			problem = "Connecting isn't available right now.";
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
			run(returned.source, {
				authorization: {
					code: returned.code,
					code_verifier: returned.verifier,
					redirect_uri: redirectUri(),
				},
				source: returned.source,
			});
		}
	});

	const readText = async (chosen: File) =>
		chosen.name.endsWith(".gz")
			? await new Response(chosen.stream().pipeThrough(new DecompressionStream("gzip"))).text()
			: await chosen.text();

	const chooseFile = async (
		input: HTMLInputElement | undefined,
		source: "myanimelist" | "sora",
	) => {
		const chosen = input?.files?.[0];
		if (input) {
			input.value = "";
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
		if (source === "myanimelist") {
			await run(source, { source, xml: text });
			return;
		}

		const { data: document, error: syntax } = attempt(() => JSON.parse(text), SyntaxError);
		if (syntax) {
			problem = "That isn't a Sora export file.";
			return;
		}

		await run(source, { document, source });
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
	<section class="space-y-6" aria-labelledby="export-heading">
		<h3 id="export-heading" class="text-lg font-bold">Export</h3>
		<Row
			label="Watchlist and History"
			description="Everything you've saved and watched, as one file any Sora can import."
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

	{#if !ready}
		<div class="space-y-6" aria-hidden="true">
			{#each { length: 3 }, index (index)}
				<div class="space-y-2">
					<Skeleton class="h-5 w-1/3" />
					<Skeleton class="h-4 w-4/5" />
				</div>
			{/each}
		</div>
	{:else}
		<section class="space-y-6" aria-labelledby="import-heading">
			<div>
				<h3 id="import-heading" class="text-lg font-bold">Import</h3>
				<p class="mt-2 text-sm leading-relaxed text-muted">
					Adds to what you have. A title already on your Watchlist keeps its status, and episodes
					you've watched stay as they are.
				</p>
			</div>

			<Row
				label="AniList"
				description={accounts.anilist_account
					? "Your whole list, public or private. You'll agree on AniList first."
					: "A public list, by username."}
			>
				{#if accounts.anilist_account}
					<Button
						variant="secondary"
						size="sm"
						loading={busy === "anilist_account"}
						disabled={busy !== null}
						onclick={() => connect("anilist_account")}
					>
						Connect
					</Button>
				{:else}
					<Button
						variant="secondary"
						size="sm"
						aria-expanded={askingUsername}
						disabled={busy !== null}
						onclick={() => (askingUsername = !askingUsername)}
					>
						Use Username
					</Button>
				{/if}
			</Row>
			{#if askingUsername && !accounts.anilist_account}
				<form
					class="space-y-5 bg-surface p-5"
					onsubmit={(event) => {
						event.preventDefault();
						run("anilist", { source: "anilist", username });
					}}
				>
					<Field name="anilist-username" label="AniList username" bind:value={username} required />
					<Button type="submit" variant="primary" class="w-full" loading={busy === "anilist"}>
						Import
					</Button>
				</form>
			{/if}

			<Row
				label="MyAnimeList"
				description={accounts.myanimelist_account
					? "Your whole list. You'll agree on MyAnimeList first."
					: "From the file MyAnimeList exports under Profile, then Export."}
			>
				{#if accounts.myanimelist_account}
					<Button
						variant="secondary"
						size="sm"
						loading={busy === "myanimelist_account"}
						disabled={busy !== null}
						onclick={() => connect("myanimelist_account")}
					>
						Connect
					</Button>
				{:else}
					<Button
						variant="secondary"
						size="sm"
						loading={busy === "myanimelist"}
						disabled={busy !== null}
						onclick={() => animeListFile?.click()}
					>
						Choose File
					</Button>
					<input
						bind:this={animeListFile}
						type="file"
						class="sr-only"
						accept=".xml,.gz,application/xml,application/gzip"
						tabindex="-1"
						aria-hidden="true"
						onchange={() => chooseFile(animeListFile, "myanimelist")}
					/>
				{/if}
			</Row>

			<Row
				label="Sora File"
				description="A file you exported from Sora, here or on another install."
			>
				<Button
					variant="secondary"
					size="sm"
					loading={busy === "sora"}
					disabled={busy !== null}
					onclick={() => soraFile?.click()}
				>
					Choose File
				</Button>
				<input
					bind:this={soraFile}
					type="file"
					class="sr-only"
					accept=".json,application/json"
					tabindex="-1"
					aria-hidden="true"
					onchange={() => chooseFile(soraFile, "sora")}
				/>
			</Row>

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
	{/if}
</Panel>
