<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
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

<Button
	{...popover.trigger}
	variant="icon"
	size="lg"
	class={cn("transition-[color,rotate]", popover.open && "rotate-30 text-foreground")}
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
			variant="item"
			class="border-b border-white/8 pl-2.5 text-foreground"
			role="menuitem"
			aria-label="Back to settings"
			onclick={() => (submenu = undefined)}
		>
			<CaretLeftIcon size="1.25rem" />
			{open.label}
		</Button>
		{#each open.options as option (option.value)}
			<Button
				role="menuitemradio"
				aria-checked={option.value === open.value}
				variant="item"
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
			<Button role="menuitem" variant="item" onclick={() => (submenu = menu.label)}>
				{menu.label}
				<span class="ml-auto text-[#999]">
					{menu.options.find((option) => option.value === menu.value)?.label}
				</span>
				<CaretRightIcon size="1.25rem" />
			</Button>
		{/each}
	{/if}
</div>
