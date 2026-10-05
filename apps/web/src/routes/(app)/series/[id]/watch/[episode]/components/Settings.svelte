<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Switch from "$lib/components/ui/Switch.svelte";
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
		signs: " (Signs)",
		captions: " (Captions)",
	};

	function pickSubtitle(url: string) {
		if (!selected || selected.audio === "raw") {
			return;
		}

		const track = selected.subtitles.find((track) => track.url === url);
		onpreferences({
			subtitles: {
				[selected.audio]: track
					? {
							language: track.language,
							kind: track.kind,
						}
					: null,
			},
		});
	}

	const menus = $derived([
		...(media.length
			? [
					{
						label: "Audio",
						value: selected?.audio ?? "",
						options: media.map((version) => ({
							value: version.audio,
							label: version.label,
						})),
						select: (value: string) =>
							onpreferences({
								audio: value as WatchMedia["audio"],
							}),
					},
				]
			: []),
		...(selected?.subtitles.length
			? [
					{
						label: "Subtitles",
						value: subtitle ?? "",
						options: [
							{
								value: "",
								label: "Off",
							},
							...selected.subtitles.map((track) => ({
								value: track.url,
								label: `${track.label}${kinds[track.kind ?? ""] ?? ""}`,
							})),
						],
						select: pickSubtitle,
					},
				]
			: []),
		{
			label: "Speed",
			value: String(player.speed),
			options: [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
				value: String(rate),
				label: rate === 1 ? "Normal" : `${rate}x`,
			})),
			select: (value: string) => (player.speed = Number(value)),
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
	class="inset-auto m-0 max-h-(--melt-popover-available-height) min-w-60 flex-col overflow-y-auto border-none bg-neutral-900/95 text-sm text-foreground/90 shadow-xl select-none open:flex"
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
		<Switch
			role="menuitemcheckbox"
			class="min-h-11 w-full px-5 py-3 text-sm text-muted hover:bg-white/8 hover:text-foreground has-checked:text-foreground has-focus-visible:bg-white/8 has-focus-visible:text-foreground"
			bind:checked={
				() => preferences.auto_skip,
				(value) =>
					onpreferences({
						auto_skip: value,
					})
			}
		>
			Auto skip
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
