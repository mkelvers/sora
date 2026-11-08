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

	import {
		authorizeImport,
		disconnectImport,
		getImportConnections,
		getImportOptions,
		importLibrary,
		undoImport,
	} from "../library.remote";
	import { begin, handoverKey, returnedFrom } from "./connection";
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
	const connections = getImportConnections();

	let busy = $state<"connect" | "import" | "file" | null>(null);
	let connecting = $state<AccountSource | null>(null);
	let announcement = $state<{
		message: string;
		importId: string | null;
		tone: "error" | "success";
	} | null>(null);

	const fail = (message: string) => {
		announcement = {
			importId: null,
			message,
			tone: "error",
		};
	};
	let fileInput = $state<HTMLInputElement>();

	const ready = $derived(options.current !== undefined);
	const providers = $derived(
		catalogue.filter((provider) => options.current?.[provider.id] === true),
	);

	const connectedAs = (id: AccountSource) =>
		connections.current?.find((connection) => connection.source === id)?.account_name;

	const redirectUri = () => `${location.origin}${location.pathname}`;

	const count = (number: number, noun: string) =>
		`${number.toLocaleString("en-US")} ${noun}${number === 1 ? "" : "s"}`;

	const summary = (report: LibraryImportReport) => {
		const titles = report.watchlist_added ? count(report.watchlist_added, "title") : null;
		const episodes = report.episodes_added ? count(report.episodes_added, "episode") : null;
		const missing = report.not_in_sora_count
			? ` ${report.not_in_sora_count.toLocaleString("en-US")} not in Sora yet; Sora is adding them.`
			: "";
		if (titles && episodes) {
			return `All done. Added ${titles} to your Watchlist and marked ${episodes} as watched.${missing}`;
		}
		if (titles) {
			return `All done. Added ${titles} to your Watchlist.${missing}`;
		}
		if (episodes) {
			return `All done. Marked ${episodes} as watched.${missing}`;
		}

		return `You're all caught up. Everything in that list is already here.${missing}`;
	};

	const run = async (input: Parameters<typeof importLibrary>[0], kind: "import" | "file") => {
		busy = kind;
		announcement = null;
		const { data, error } = await attempt(importLibrary(input), Error);
		busy = null;
		connecting = null;
		if (error) {
			fail(
				kind === "import"
					? "That couldn't be imported. Connect again and it should work."
					: "That file couldn't be imported. Check it's the right one and try again.",
			);
			return;
		}

		announcement = {
			importId: data.import_id,
			message: summary(data),
			tone: "success",
		};
	};

	const undo = async () => {
		const importId = announcement?.importId;
		if (!importId) {
			return;
		}

		announcement = null;
		const { error } = await attempt(undoImport(importId), Error);
		announcement = {
			importId: null,
			message: error ? "That couldn't be undone." : "Import undone.",
			tone: error ? "error" : "success",
		};
	};

	const disconnect = async (id: AccountSource) => {
		await disconnectImport(id);
	};

	const popupFeatures = "popup,width=520,height=720";
	const closedGraceMs = 2000;
	let popup: Window | null = null;

	const finishConnecting = (search: string) => {
		const returned = returnedFrom(search);
		if (!returned) {
			return;
		}

		if (returned.kind === "refused") {
			busy = null;
			connecting = null;
			fail("You didn't agree, so nothing was imported.");
		} else if (returned.kind === "unknown") {
			busy = null;
			connecting = null;
			fail("That connection couldn't be checked. Try connecting again.");
		} else {
			connecting = returned.source;
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
	};

	/**
	 * Signs in on the site in a small window, so this page never reloads. A
	 * browser that blocks the window gets the whole page sent there instead.
	 */
	const connect = async (selected: (typeof catalogue)[number]) => {
		busy = "connect";
		connecting = selected.id;
		popup = window.open("", "", popupFeatures);
		const { challenge, state } = begin(selected.id, popup !== null);
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
			popup?.close();
			popup = null;
			busy = null;
			connecting = null;
			fail(`Connecting to ${selected.name} isn't available right now.`);
			return;
		}
		if (!popup) {
			location.href = data.url;
			return;
		}

		popup.location.href = data.url;
	};

	$effect(() => {
		const params = new URLSearchParams(location.search);
		if (!params.has("code") && !params.has("error")) {
			return;
		}
		history.replaceState(history.state, "", location.pathname);
		finishConnecting(location.search);
	});

	const onReturn = (event: StorageEvent) => {
		const waiting = busy === "connect" && connecting !== null;
		if (event.key !== handoverKey || !event.newValue || !waiting) {
			return;
		}

		popup = null;
		attempt(() => localStorage.removeItem(handoverKey), DOMException);
		finishConnecting(event.newValue);
	};

	$effect(() => {
		window.addEventListener("storage", onReturn);
		let closedSince: number | null = null;
		const watchClosed = setInterval(() => {
			if (!popup?.closed) {
				closedSince = null;
				return;
			}

			closedSince ??= Date.now();
			if (Date.now() - closedSince > closedGraceMs && busy === "connect") {
				popup = null;
				busy = null;
				connecting = null;
			}
		}, 500);
		return () => {
			window.removeEventListener("storage", onReturn);
			clearInterval(watchClosed);
		};
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

		announcement = null;
		if (chosen.size > maxFileBytes) {
			fail("That file is too large to import. The limit is 20 MB.");
			return;
		}

		const { data: text, error } = await attempt(readText(chosen), Error);
		if (error) {
			fail("That file couldn't be read.");
			return;
		}

		const start = text.trimStart().charAt(0);
		if (start === "<") {
			await run({ source: "myanimelist", xml: text }, "file");
			return;
		}

		const { data: document, error: syntax } = attempt(() => JSON.parse(text), SyntaxError);
		if (start !== "{" || syntax) {
			fail("That isn't a MyAnimeList export or a file downloaded from Export.");
			return;
		}

		await run({ document, source: "sora" }, "file");
	};
</script>

<svelte:head>
	<title>Import and Export - Settings - Sora</title>
</svelte:head>

<StatusBanner
	message={announcement?.message ?? ""}
	tone={announcement?.tone}
	action={announcement?.importId ? { label: "Undo", onclick: undo } : undefined}
	ondismiss={() => (announcement = null)}
/>

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
				{@const account = connectedAs(provider.id)}
				<div class="flex items-start justify-between gap-6">
					<div class="flex min-w-0 items-start gap-4">
						<img src={provider.icon} alt="" class="mt-0.5 size-6 shrink-0" />
						<div class="min-w-0">
							<p class="text-base leading-6 font-semibold">{provider.name}</p>
							<p class="mt-1 text-sm leading-relaxed break-words text-muted" aria-live="polite">
								{#if connecting === provider.id && busy === "import"}
									Reading your list. This can take a moment.
								{:else if account}
									Connected as {account}.
								{:else}
									Sign in and Sora brings your list over.
								{/if}
							</p>
							{#if account}
								<Button
									variant="plain"
									size="sm"
									class="mt-1 h-auto w-auto text-sm font-normal text-muted underline underline-offset-2"
									disabled={busy !== null}
									aria-label="Disconnect {provider.name}"
									onclick={() => disconnect(provider.id)}
								>
									Disconnect
								</Button>
							{/if}
						</div>
					</div>
					<Button
						variant="plain"
						size="sm"
						class="-mt-1.5 w-24 justify-end"
						loading={connecting === provider.id}
						disabled={busy !== null}
						aria-label="{account ? 'Import from' : 'Connect'} {provider.name}"
						onclick={() => connect(provider)}
					>
						{account ? "Import" : "Connect"}
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
			</div>
		{/if}
	</section>

	<section class="space-y-8" aria-labelledby="export-heading">
		<h3 id="export-heading" class="text-lg font-bold">Export</h3>
		<div class="flex items-start justify-between gap-6">
			<div class="flex min-w-0 items-start gap-4">
				<DownloadSimpleIcon size="1.5rem" class="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
				<div class="min-w-0">
					<p class="text-base leading-6 font-semibold">Watchlist and History</p>
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
