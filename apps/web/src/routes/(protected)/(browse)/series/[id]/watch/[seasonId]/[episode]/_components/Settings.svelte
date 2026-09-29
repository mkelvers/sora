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
						label:
							track.kind === "signs"
								? `${track.label} (Signs)`
								: track.kind === "captions"
									? `${track.label} (Captions)`
									: track.label,
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
				label: rate === 1 ? "Normal" : `${rate}x`,
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
		closeOnOutsideClick: (element) => !(element instanceof Element) || element.isConnected,
		floatingConfig: {
			computePosition: {
				placement: "top-end",
			},
			offset: 8,
		},
	});
</script>

<div>
	<Button
		{...popover.trigger}
		class={[
			"size-9 rounded-full p-0 text-[#ddd] transition-[background-color,color,rotate] duration-[120ms,120ms,200ms] hover:bg-white/10 hover:text-white sm:size-10",
			popover.open && "rotate-30 bg-white/10 text-white",
		]}
		aria-label="Settings"
	>
		<GearSixIcon size="1.5rem" weight="fill" />
	</Button>

	<div
		{...popover.content}
		bind:this={content}
		role="menu"
		aria-label={open?.label ?? "Settings"}
		class="inset-auto m-0 max-h-(--melt-popover-available-height) min-w-60 flex-col overflow-y-auto border-none bg-[rgb(28_28_28/0.96)] text-sm text-[#e6e6e6] shadow-[0_8px_24px_rgb(0_0_0/0.5)] open:flex"
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
				class="w-full justify-start border-b border-white/8 px-4 py-2.5 pl-2.5 text-left text-sm font-medium font-normal focus:bg-white/8 focus:text-white focus:outline-none focus-visible:ring-0"
				onclick={() => (submenu = undefined)}
			>
				<CaretLeftIcon size="1.25rem" />
				{open.label}
			</Button>
			{#each open.options as option (option.value)}
				<Button
					role="menuitemradio"
					aria-checked={option.value === open.value}
					class="w-full justify-start px-4 py-2.5 text-left text-sm font-normal focus:bg-white/8 focus:text-white focus:outline-none focus-visible:ring-0"
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
					class="w-full justify-start px-4 py-2.5 text-left text-sm font-normal focus:bg-white/8 focus:text-white focus:outline-none focus-visible:ring-0"
					onclick={() => (submenu = menu.label)}
				>
					{menu.label}
					<span class="ml-auto text-[#999]">
						{menu.options.find((option) => option.value === menu.value)?.label}
					</span>
					<CaretRightIcon size="1.25rem" />
				</Button>
			{/each}
		{/if}
	</div>
</div>
