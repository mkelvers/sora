<script lang="ts">
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Panel from "$routes/(app)/settings/components/panel.svelte";

	import { getDevices, signOutDevice, signOutOtherDevices } from "../devices.remote";

	const devices = getDevices();

	let message = $state("");
	let busy = $state<string | null>(null);

	const others = $derived((devices.current ?? []).filter((device) => !device.current));

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

	const signOut = async (id: string, name: string) => {
		busy = id;
		await signOutDevice(id);
		message = `${name} signed out.`;
		busy = null;
	};

	const signOutOthers = async () => {
		busy = "others";
		await signOutOtherDevices();
		message = "Every other device signed out.";
		busy = null;
	};
</script>

<svelte:head>
	<title>Devices - Settings - Sora</title>
</svelte:head>

<StatusBanner {message} ondismiss={() => (message = "")} />

<Panel
	title="Devices"
	description="Where you're signed in. Sign out a device you don't use or know."
>
	{#if devices.current}
		<ul class="space-y-8">
			{#each devices.current as device (device.id)}
				<li class="flex items-start justify-between gap-6">
					<div class="min-w-0">
						<p class="text-base leading-6 font-semibold">
							{device.device}
							{#if device.current}
								<span class="ml-2 text-sm font-normal text-muted">This device</span>
							{/if}
						</p>
						<p class="mt-1 text-sm leading-relaxed text-muted">
							Last active {since(device.last_active_at)}
						</p>
						<p class="text-sm leading-relaxed text-muted">
							Signed in {day(device.signed_in_at)}{device.ip_address
								? ` from ${device.ip_address}`
								: ""}
						</p>
					</div>
					{#if !device.current}
						<Button
							variant="ghost"
							size="sm"
							loading={busy === device.id}
							aria-label="Sign out {device.device}"
							onclick={() => signOut(device.id, device.device)}
						>
							Sign Out
						</Button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if others.length}
			<Button
				variant="secondary"
				tone="danger"
				class="w-full"
				loading={busy === "others"}
				onclick={signOutOthers}
			>
				Sign Out All Other Devices
			</Button>
		{/if}
	{/if}
</Panel>
