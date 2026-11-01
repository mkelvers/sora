<script lang="ts">
	import Skeleton from "$lib/components/snippets/skeleton.svelte";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { cn } from "$lib/utils";
	import Panel from "$routes/(app)/settings/components/panel.svelte";
	import type { SignedInDevice } from "@sora/sdk";
	import {
		CaretDownIcon,
		DesktopIcon,
		DeviceMobileIcon,
		DeviceTabletIcon,
		GlobeSimpleIcon,
		TelevisionSimpleIcon,
	} from "phosphor-svelte";

	import { getDevices, signOutDevice, signOutOtherDevices } from "../devices.remote";

	const icons = {
		computer: DesktopIcon,
		phone: DeviceMobileIcon,
		tablet: DeviceTabletIcon,
		tv: TelevisionSimpleIcon,
		unknown: GlobeSimpleIcon,
	} as const;

	const shownAtFirst = 5;

	const loaded = getDevices();
	const devices = $derived(loaded.current ?? []);

	let message = $state("");
	let busy = $state<string | null>(null);
	let showAll = $state(false);
	let choosing = $state(false);
	let logoutForm = $state<HTMLFormElement>();

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

	const day = (iso: string) =>
		new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
		}).format(new Date(iso));

	const stamp = (iso: string) =>
		new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			hour12: false,
			timeStyle: "short",
		}).format(new Date(iso));

	const withVersion = (name: string | null, version: string | null) => {
		if (!name) {
			return null;
		}

		return version ? `${name} ${version}` : name;
	};

	const facts = (entry: SignedInDevice) =>
		[
			["Browser", withVersion(entry.browser, entry.browser_version)],
			["System", withVersion(entry.system, entry.system_version)],
			["Signed in", stamp(entry.signed_in_at)],
			["Last active", stamp(entry.last_active_at)],
			["IP address", entry.ip_address],
		].filter((fact): fact is [string, string] => fact[1] !== null);

	const nameOf = (entry: SignedInDevice) =>
		entry.kind === "unknown" ? `Signed in ${day(entry.signed_in_at)}` : entry.device;

	const signOut = async (device: SignedInDevice) => {
		busy = device.id;
		await signOutDevice(device.id);
		message = `${nameOf(device)} signed out.`;
		busy = null;
	};

	const signOutEverywhere = async () => {
		choosing = false;
		busy = "everywhere";
		await signOutOtherDevices();
		logoutForm?.requestSubmit();
	};

	const signOutOthers = async () => {
		choosing = false;
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
	<li>
		<div class="flex items-center gap-4">
			<Icon
				size="1.75rem"
				class={cn("shrink-0 text-muted", entry.current && "text-accent-secondary")}
				aria-hidden="true"
			/>
			<div class="min-w-0 flex-1">
				<p class="truncate text-base leading-6 font-semibold">{nameOf(entry)}</p>
				<p class="text-sm text-muted">
					{#if entry.current}
						<span class="text-accent-secondary">Active now</span>
					{:else}
						Active {since(entry.last_active_at)}
					{/if}
				</p>
			</div>
			{#if !entry.current}
				<Button
					variant="plain"
					size="sm"
					class="-mt-1.5 w-24 justify-end"
					loading={busy === entry.id}
					aria-label="Sign out {nameOf(entry)}"
					onclick={() => signOut(entry)}
				>
					Sign out
				</Button>
			{/if}
		</div>
		<dl class="mt-4 ml-11 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
			{#each facts(entry) as [term, value] (term)}
				<div class="min-w-0">
					<dt class="text-muted">{term}</dt>
					<dd class="mt-0.5 font-medium break-words tabular-nums">{value}</dd>
				</div>
			{/each}
		</dl>
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
		<section class="space-y-4" aria-labelledby="this-device-heading">
			<div class="flex items-center justify-between gap-4">
				<h3 id="this-device-heading" class="text-lg font-bold">This device</h3>
				<Button
					variant="text"
					class="px-0 sm:hidden"
					aria-haspopup="dialog"
					aria-controls="sign-out-menu"
					aria-expanded={choosing}
					loading={busy === "others" || busy === "everywhere"}
					onclick={() => (choosing = true)}
				>
					Sign out
					<CaretDownIcon size="1rem" weight="bold" aria-hidden="true" />
				</Button>
				<div class="max-sm:hidden">
					<Dropdown variant="text" label="Sign out of devices">
						{#snippet trigger()}
							Sign out
							<CaretDownIcon size="1rem" weight="bold" aria-hidden="true" />
						{/snippet}

						{#snippet children()}
							<div role="menu" aria-label="Sign out of devices">
								{#if others.length}
									<Button role="menuitem" variant="item" onclick={signOutOthers}>
										Sign out other devices
									</Button>
								{/if}
								<Button role="menuitem" variant="item" tone="danger" onclick={signOutEverywhere}>
									Sign out all devices
								</Button>
							</div>
						{/snippet}
					</Dropdown>
				</div>
			</div>

			{#if here}
				<ul>
					{@render device(here)}
				</ul>
			{/if}
		</section>

		{#if others.length}
			<section class="space-y-6" aria-labelledby="other-devices-heading">
				<h3 id="other-devices-heading" class="text-lg font-bold">Other devices</h3>

				<ul class="space-y-8">
					{#each listed as entry (entry.id)}
						{@render device(entry)}
					{/each}
				</ul>
				{#if others.length > shownAtFirst}
					<Button variant="text" class="px-0" onclick={() => (showAll = !showAll)}>
						{showAll ? "Show fewer" : `Show ${others.length - shownAtFirst} more`}
					</Button>
				{/if}
			</section>
		{/if}
	{/if}
</Panel>

<Sheet bind:open={choosing} id="sign-out-menu" title="Sign out">
	{#if others.length}
		<Button variant="item" onclick={signOutOthers}>Sign out other devices</Button>
	{/if}
	<Button variant="item" tone="danger" onclick={signOutEverywhere}>Sign out all devices</Button>
</Sheet>

<form bind:this={logoutForm} method="POST" action="/logout" hidden></form>
