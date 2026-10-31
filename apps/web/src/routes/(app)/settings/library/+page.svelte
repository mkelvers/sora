<script lang="ts">
	import anilist from "$lib/assets/providers/anilist.svg";
	import myanimelist from "$lib/assets/providers/myanimelist.svg";
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import type { LibraryImportReport } from "@sora/sdk";
	import { attempt } from "@sora/shared";
	import { DownloadSimpleIcon, FileArrowUpIcon } from "phosphor-svelte";

	import { authorizeImport, getImportOptions, importLibrary } from "../library.remote";
	import { begin, returnedFrom } from "./connection";
	import type { AccountSource } from "./connection";

	/** The sites a list can be connected from, with their marks. */
	const catalogue = [
		{
			icon: anilist,
			id: "anilist_account",
			name: "AniList",
		},
		{
			icon: myanimelist,
			id: "myanimelist_account",
			name: "MyAnimeList",
		},
	] as const;

	const maxFileBytes = 20_000_000;

	const options = getImportOptions();

	let busy = $state<"connect" | "import" | "file" | null>(null);
	let connecting = $state<AccountSource | null>(null);
	let report = $state<LibraryImportReport | null>(null);
	let announced = $state(false);
	let problem = $state("");
	let fileInput = $state<HTMLInputElement>();

	const ready = $derived(options.current !== undefined);
	const providers = $derived(
		catalogue.filter((provider) => options.current?.[provider.id] === true),
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

	const connect = async (selected: (typeof catalogue)[number]) => {
		busy = "connect";
		connecting = selected.id;
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
			connecting = null;
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
	description="Bring your Watchlist and history in, or take them with you."
>
	<section class="space-y-8" aria-labelledby="import-heading">
		<h3 id="import-heading" class="text-lg font-bold">Import</h3>

		{#if !ready}
			<div class="space-y-8" aria-hidden="true">
				<Skeleton class="h-12" />
				<Skeleton class="h-12" />
			</div>
		{:else}
			{#each providers as provider (provider.id)}
				<div class="flex items-start justify-between gap-6">
					<div class="flex min-w-0 items-start gap-4">
						<img src={provider.icon} alt="" class="mt-0.5 size-6 shrink-0" />
						<div class="min-w-0">
							<p class="text-base leading-6 font-semibold">{provider.name}</p>
							<p class="mt-1 text-sm leading-relaxed text-muted" aria-live="polite">
								{busy === "import" && connecting === provider.id
									? "Reading your list. This can take a moment."
									: "Sign in and Sora brings your list over."}
							</p>
						</div>
					</div>
					<Button
						variant="plain"
						size="sm"
						class="-mt-1.5 w-24 justify-end"
						loading={connecting === provider.id}
						disabled={busy !== null}
						aria-label="Connect {provider.name}"
						onclick={() => connect(provider)}
					>
						Connect
					</Button>
				</div>
			{/each}

			<div class="flex items-start justify-between gap-6">
				<div class="flex min-w-0 items-start gap-4">
					<FileArrowUpIcon size="1.5rem" class="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
					<div class="min-w-0">
						<p class="text-base leading-6 font-semibold">File</p>
						<p class="mt-1 text-sm leading-relaxed text-muted">
							A MyAnimeList export, or a file you downloaded from Export.
						</p>
					</div>
				</div>
				<Button
					variant="plain"
					size="sm"
					class="-mt-1.5 w-24 justify-end"
					loading={busy === "file"}
					disabled={busy !== null}
					onclick={() => fileInput?.click()}
				>
					Choose file
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
			</div>
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

	<section class="space-y-8" aria-labelledby="export-heading">
		<h3 id="export-heading" class="text-lg font-bold">Export</h3>
		<div class="flex items-start justify-between gap-6">
			<div class="flex min-w-0 items-start gap-4">
				<DownloadSimpleIcon size="1.5rem" class="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
				<div class="min-w-0">
					<p class="text-base leading-6 font-semibold">Watchlist and history</p>
					<p class="mt-1 text-sm leading-relaxed text-muted">
						One file you can import again anywhere.
					</p>
				</div>
			</div>
			<Button
				variant="plain"
				size="sm"
				class="-mt-1.5 w-24 justify-end"
				href="/settings/library/export"
				download
				data-sveltekit-reload
			>
				Download
			</Button>
		</div>
	</section>
</Panel>
