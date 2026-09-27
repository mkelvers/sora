<script lang="ts">
	import type { PlaybackMedia } from "@sora/sdk";
	import { CaretLeftIcon, CaretRightIcon, CheckIcon, GearSixIcon } from "phosphor-svelte";
	import Button from "$lib/components/ui/Button.svelte";

	type Props = {
		media: PlaybackMedia[];
		audio: PlaybackMedia["audio"] | undefined;
		subtitles: PlaybackMedia["subtitles"];
		subtitle: string | undefined;
		speed: number;
	};

	let {
		media,
		audio = $bindable(),
		subtitles,
		subtitle = $bindable(),
		speed = $bindable(),
	}: Props = $props();

	type Menu = {
		label: string;
		value: string;
		options: {
			value: string;
			label: string;
		}[];
		select: (value: string) => void;
	};

	const menus = $derived.by(() => {
		const menus: Menu[] = [];

		if (media.length > 0) {
			menus.push({
				label: "Audio",
				value: audio ?? "",
				options: media.map((version) => ({
					value: version.audio,
					label: version.label,
				})),
				select: (value) => (audio = value as PlaybackMedia["audio"]),
			});
		}

		if (subtitles.length > 0) {
			menus.push({
				label: "Subtitles",
				value: subtitle ?? "",
				options: [
					{
						value: "",
						label: "Off",
					},
					...subtitles.map((track) => ({
						value: track.url,
						label: track.label,
					})),
				],
				select: (value) => (subtitle = value || undefined),
			});
		}

		menus.push({
			label: "Speed",
			value: String(speed),
			options: [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
				value: String(rate),
				label: rate === 1 ? "Normal" : `${rate}×`,
			})),
			select: (value) => (speed = Number(value)),
		});

		return menus;
	});

	let submenu = $state<string>();
	const open = $derived(menus.find((menu) => menu.label === submenu));
</script>

<div class="relative">
	<Button
		class="player-settings-trigger grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 active:scale-90 sm:size-9"
		popovertarget="player-settings"
		aria-label="Settings"
	>
		<GearSixIcon size="1.5rem" weight="bold" />
	</Button>

	<div
		id="player-settings"
		popover
		role="menu"
		aria-label={open?.label ?? "Settings"}
		class="player-settings m-0 mb-3 max-h-[min(60vh,28rem)] w-72 flex-col overflow-y-auto bg-player-panel py-2 text-sm text-watch-secondary shadow-lg open:flex"
		ontoggle={() => (submenu = undefined)}
	>
		{#if open}
			<Button
				class="flex min-h-11 w-full items-center justify-start gap-2 border-b border-white/10 px-3 font-bold text-watch-primary hover:bg-white/5"
				onclick={() => (submenu = undefined)}
			>
				<CaretLeftIcon size="1.1rem" weight="bold" />
				{open.label}
			</Button>
			{#each open.options as option (option.value)}
				<Button
					role="menuitemradio"
					aria-checked={option.value === open.value}
					class="flex min-h-11 w-full items-center justify-start gap-3 px-4 hover:bg-white/5 hover:text-watch-primary aria-checked:text-watch-primary"
					onclick={() => {
						open.select(option.value);
						submenu = undefined;
					}}
				>
					<span class="grid w-4 place-items-center text-accent">
						{#if option.value === open.value}
							<CheckIcon size="1rem" weight="bold" />
						{/if}
					</span>
					{option.label}
				</Button>
			{/each}
		{:else}
			{#each menus as menu (menu.label)}
				<Button
					role="menuitem"
					class="flex min-h-11 w-full items-center justify-start gap-3 px-4 hover:bg-white/5 hover:text-watch-primary"
					onclick={() => (submenu = menu.label)}
				>
					{menu.label}
					<span class="ml-auto text-watch-muted">
						{menu.options.find((option) => option.value === menu.value)?.label}
					</span>
					<CaretRightIcon size="1rem" weight="bold" />
				</Button>
			{/each}
		{/if}
	</div>
</div>

<style>
	:global(.player-settings-trigger) {
		anchor-name: --player-settings;
	}

	.player-settings {
		position-anchor: --player-settings;
		inset: auto;
		right: anchor(right);
		bottom: anchor(top);
	}
</style>
