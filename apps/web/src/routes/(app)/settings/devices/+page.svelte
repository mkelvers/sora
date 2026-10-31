<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import { cn } from "$lib/utils";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import type { SignedInDevice } from "@sora/sdk";
	import {
		DesktopIcon,
		DeviceMobileIcon,
		DeviceTabletIcon,
		QuestionIcon,
		TelevisionSimpleIcon,
	} from "phosphor-svelte";

	import { getDevices, signOutDevice, signOutOtherDevices } from "../devices.remote";

	const icons = {
		computer: DesktopIcon,
		phone: DeviceMobileIcon,
		tablet: DeviceTabletIcon,
		tv: TelevisionSimpleIcon,
		unknown: QuestionIcon,
	} as const;

	const shownAtFirst = 5;

	const loaded = getDevices();
	const devices = $derived(loaded.current ?? []);

	let message = $state("");
	let busy = $state<string | null>(null);
	let showAll = $state(false);

	const here = $derived(devices.find((device) => device.current));
	const others = $derived(devices.filter((device) => !device.current));
	const listed = $derived(showAll ? others : others.slice(0, shownAtFirst));

	const since = (iso: string) => {
		const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
		const units = [
			["day", 86_400],
			["hour", 3600],
			["minute", 60],
		] as const;
		const formatter = new Intl.RelativeTimeFormat("en", {
			numeric: "auto",
		});
		for (const [unit, length] of units) {
			if (Math.abs(seconds) >= length) {
				return formatter.format(Math.round(seconds / length), unit);
			}
		}

		return "just now";
	};

	const signOut = async (device: SignedInDevice) => {
		busy = device.id;
		await signOutDevice(device.id);
		message = `${device.device} signed out.`;
		busy = null;
	};

	const signOutOthers = async () => {
		busy = "others";
		await signOutOtherDevices();
		message = "Every other device signed out.";
		showAll = false;
		busy = null;
	};
</script>

<svelte:head>
	<title>Devices - Settings - Sora</title>
</svelte:head>

<StatusBanner {message} ondismiss={() => (message = "")} />

{#snippet device(entry: SignedInDevice)}
	{@const Icon = icons[entry.kind]}
	<li class="flex items-center gap-4">
		<span
			class={cn(
				"grid size-11 shrink-0 place-items-center bg-surface text-muted",
				entry.current && "text-accent-secondary",
			)}
		>
			<Icon size="1.5rem" aria-hidden="true" />
		</span>
		<div class="min-w-0 flex-1">
			<p class="truncate text-base leading-6 font-semibold">{entry.device}</p>
			<p class="text-sm break-words text-muted">
				{#if entry.current}
					<span class="text-accent-secondary">This device</span>
				{:else}
					Active {since(entry.last_active_at)}
				{/if}
				{#if entry.ip_address}
					<span aria-hidden="true">•</span>
					{entry.ip_address}
				{/if}
			</p>
		</div>
		{#if !entry.current}
			<Button
				variant="ghost"
				size="sm"
				loading={busy === entry.id}
				aria-label="Sign out {entry.device}"
				onclick={() => signOut(entry)}
			>
				Sign Out
			</Button>
		{/if}
	</li>
{/snippet}

<Panel
	title="Devices"
	description="Where you're signed in. Sign out any device you don't use or know."
>
	{#if loaded.current === undefined}
		{#each { length: 3 }, index (index)}
			<div class="flex items-center gap-4">
				<Skeleton class="size-11 shrink-0" />
				<div class="flex-1 space-y-2">
					<Skeleton class="h-5 w-2/5" />
					<Skeleton class="h-4 w-3/5" />
				</div>
			</div>
		{/each}
	{:else}
		{#if here}
			<ul>
				{@render device(here)}
			</ul>
		{/if}

		<div class="space-y-6">
			<div class="flex items-center justify-between gap-4">
				<h3 class="text-lg font-bold">Other Devices</h3>
				{#if others.length}
					<Button
						variant="ghost"
						size="sm"
						tone="danger"
						loading={busy === "others"}
						onclick={signOutOthers}
					>
						Sign Out All
					</Button>
				{/if}
			</div>

			{#if others.length}
				<ul class="space-y-6">
					{#each listed as entry (entry.id)}
						{@render device(entry)}
					{/each}
				</ul>
				{#if others.length > shownAtFirst}
					<Button variant="text" class="px-0" onclick={() => (showAll = !showAll)}>
						{showAll ? "Show Fewer" : `Show ${others.length - shownAtFirst} More`}
					</Button>
				{/if}
			{:else}
				<p class="text-sm text-muted">You're not signed in anywhere else.</p>
			{/if}
		</div>
	{/if}
</Panel>
