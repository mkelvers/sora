<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import type { PlaybackMedia } from "@sora/sdk";
	import { Popover } from "melt/builders";
	import { CaretLeftIcon, CaretRightIcon, GearSixIcon } from "phosphor-svelte";
	import { tick } from "svelte";

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

	let content = $state<HTMLElement>();

	$effect(() => {
		if (open) {
			tick().then(() => content?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
		}
	});

	const popover = new Popover({
		onOpenChange: () => (submenu = undefined),
		floatingConfig: {
			computePosition: {
				placement: "top-end",
			},
			offset: 12,
		},
	});
</script>

<div class="relative">
	<Button
		{...popover.trigger}
		class="grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 active:scale-90 sm:size-9"
		aria-label="Settings"
	>
		<GearSixIcon size="1.5rem" weight="bold" />
	</Button>

	<div
		{...popover.content}
		bind:this={content}
		role="menu"
		aria-label={open?.label ?? "Settings"}
		class="inset-auto m-0 max-h-[min(60vh,28rem)] w-72 flex-col overflow-y-auto bg-player-panel text-sm text-watch-secondary shadow-lg open:flex"
		onpointermove={(event) => {
			const item = (event.target as HTMLElement).closest<HTMLElement>("button");
			if (item && item !== document.activeElement) {
				item.focus({
					preventScroll: true,
				});
			}
		}}
	>
		{#if open}
			<Button
				class="flex min-h-11 w-full items-center justify-start gap-2 border-b border-white/10 px-3 font-bold text-watch-primary focus:bg-white/5 focus:outline-none"
				onclick={() => (submenu = undefined)}
			>
				<CaretLeftIcon size="1.1rem" weight="bold" />
				{open.label}
			</Button>
			{#each open.options as option (option.value)}
				<Button
					role="menuitemradio"
					aria-checked={option.value === open.value}
					class="flex min-h-11 w-full items-center justify-start gap-3 px-4 focus:bg-white/5 focus:text-watch-primary focus:outline-none"
					onclick={() => {
						open.select(option.value);
						submenu = undefined;
					}}
				>
					{option.label}
				</Button>
			{/each}
		{:else}
			{#each menus as menu (menu.label)}
				<Button
					role="menuitem"
					class="flex min-h-11 w-full items-center justify-start gap-3 px-4 focus:bg-white/5 focus:text-watch-primary focus:outline-none"
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
