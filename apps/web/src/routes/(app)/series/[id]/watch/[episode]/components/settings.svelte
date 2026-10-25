<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Switch from "$lib/components/ui/switch.svelte";
	import { cn, moveMenuFocus } from "$lib/utils";
	import type { WatchMedia } from "$routes/(app)/series/[id]/watch/[episode]/watch.remote";
	import type { Player } from "$routes/(app)/series/[id]/watch/[episode]/watch.svelte";
	import type { PlaybackPreferences, PlaybackPreferencesUpdate } from "@sora/sdk";
	import { Popover } from "melt/builders";
	import { CaretLeftIcon, CaretRightIcon, GearSixIcon } from "phosphor-svelte";
	import { tick } from "svelte";

	let {
		media,
		selected,
		subtitle,
		preferences,
		player,
		onpreferences,
	}: {
		media: WatchMedia[];
		selected?: WatchMedia;
		subtitle?: string;
		preferences: PlaybackPreferences;
		player: Player;
		onpreferences: (changes: PlaybackPreferencesUpdate) => void;
	} = $props();

	const kinds: Record<string, string> = {
		captions: " (Captions)",
		signs: " (Signs)",
	};

	const pickSubtitle = (url: string) => {
		if (!selected || selected.audio === "raw") {
			return;
		}

		const track = selected.subtitles.find((track) => track.url === url);
		onpreferences({
			subtitles: {
				[selected.audio]: track
					? {
							kind: track.kind,
							language: track.language,
						}
					: null,
			},
		});
	};

	const menus = $derived([
		...(media.length
			? [
					{
						label: "Audio",
						options: media.map((version) => ({
							label: version.label,
							value: version.audio,
						})),
						select: (value: string) =>
							onpreferences({
								audio: value as WatchMedia["audio"],
							}),
						value: selected?.audio ?? "",
					},
				]
			: []),
		...(selected?.subtitles.length
			? [
					{
						label: "Subtitles",
						options: [
							{
								label: "Off",
								value: "",
							},
							...selected.subtitles.map((track) => ({
								label: `${track.label}${kinds[track.kind ?? ""] ?? ""}`,
								value: track.url,
							})),
						],
						select: pickSubtitle,
						value: subtitle ?? "",
					},
				]
			: []),
		{
			label: "Speed",
			options: [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
				label: rate === 1 ? "Normal" : `${rate}x`,
				value: String(rate),
			})),
			select: (value: string) => (player.speed = Number(value)),
			value: String(player.speed),
		},
	]);

	let submenu = $state<string>();
	const open = $derived(menus.find((menu) => menu.label === submenu));

	let content = $state<HTMLElement>();

	$effect(() => {
		if (open) {
			tick().then(() => content?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
		}
	});

	const popover = new Popover({
		closeOnOutsideClick: (element) => !(element instanceof Element) || element.isConnected,
		floatingConfig: {
			computePosition: {
				placement: "top-end",
			},
			offset: 8,
		},
		onOpenChange: () => (submenu = undefined),
	});
</script>

<Button
	{...popover.trigger}
	variant="icon"
	class={cn("transition-[color,background-color,rotate]", popover.open && "rotate-30")}
	aria-expanded={popover.open}
	aria-label="Settings"
>
	<GearSixIcon size="1.5rem" weight="fill" />
</Button>

<div
	{...popover.content}
	bind:this={content}
	role="menu"
	aria-label={open?.label ?? "Settings"}
	class="inset-auto m-0 max-h-(--melt-popover-available-height) min-w-60 flex-col overflow-y-auto border-none bg-raised/95 text-sm shadow-lg select-none open:flex"
	onkeydown={moveMenuFocus}
	onpointermove={(event) => {
		const target = (event.target as HTMLElement).closest<HTMLElement>("button, label");
		const item = target instanceof HTMLLabelElement ? target.control : target;
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
			class="pl-3"
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
		<Switch
			role="menuitemcheckbox"
			class="min-h-11 w-full px-5 py-3 text-sm text-muted hover:bg-hover hover:text-foreground has-checked:text-foreground has-focus-visible:bg-hover has-focus-visible:text-foreground"
			bind:checked={
				() => preferences.auto_skip,
				(value) =>
					onpreferences({
						auto_skip: value,
					})
			}
		>
			Auto Skip
		</Switch>
		{#each menus as menu (menu.label)}
			<Button role="menuitem" variant="item" onclick={() => (submenu = menu.label)}>
				{menu.label}
				<span class="ml-auto text-muted">
					{menu.options.find((option) => option.value === menu.value)?.label}
				</span>
				<CaretRightIcon size="1.25rem" />
			</Button>
		{/each}
	{/if}
</div>
