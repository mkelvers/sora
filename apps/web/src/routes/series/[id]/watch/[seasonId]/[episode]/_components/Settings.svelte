<script lang="ts">
	import type { PlaybackMedia } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	type Props = {
		media: PlaybackMedia[];
		audio: PlaybackMedia['audio'] | undefined;
		subtitles: PlaybackMedia['subtitles'];
		subtitle: string | undefined;
		speed: number;
	};

	let { media, audio = $bindable(), subtitles, subtitle = $bindable(), speed = $bindable() }: Props = $props();

	type Menu = {
		label: string;
		value: string;
		options: { value: string; label: string }[];
		select: (value: string) => void;
	};

	const menus: Menu[] = $derived([
		...(media.length > 1
			? [
					{
						label: 'Audio',
						value: audio ?? '',
						options: media.map((version) => ({ value: version.audio, label: version.label })),
						select: (value: string) => (audio = value as PlaybackMedia['audio'])
					}
				]
			: []),
		...(subtitles.length > 0
			? [
					{
						label: 'Subtitles',
						value: subtitle ?? '',
						options: [{ value: '', label: 'Off' }, ...subtitles.map((track) => ({ value: track.url, label: track.label }))],
						select: (value: string) => (subtitle = value || undefined)
					}
				]
			: []),
		{
			label: 'Speed',
			value: String(speed),
			options: [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({ value: String(rate), label: rate === 1 ? 'Normal' : `${rate}×` })),
			select: (value: string) => (speed = Number(value))
		}
	]);

	let submenu = $state<string>();
	const open = $derived(menus.find((menu) => menu.label === submenu));
</script>

<div class="settings">
	<Dropdown
		id="player-settings"
		label="Settings"
		role="menu"
		aria-label={open?.label ?? 'Settings'}
		ontoggle={() => (submenu = undefined)}
	>
		{#snippet trigger()}
			<Icon name="settings" />
		{/snippet}

		{#if open}
			<Button class="back" onclick={() => (submenu = undefined)}>
				<Icon name="chevron-left" size="md" />
				{open.label}
			</Button>
			{#each open.options as option (option.value)}
				<Button
					role="menuitemradio"
					aria-checked={option.value === open.value}
					onclick={() => {
						open.select(option.value);
						submenu = undefined;
					}}
				>
					<span class="check">
						{#if option.value === open.value}
							<Icon name="check" size="sm" />
						{/if}
					</span>
					{option.label}
				</Button>
			{/each}
		{:else}
			{#each menus as menu (menu.label)}
				<Button role="menuitem" onclick={() => (submenu = menu.label)}>
					{menu.label}
					<span class="value">{menu.options.find((option) => option.value === menu.value)?.label}</span>
					<Icon name="chevron-right" size="md" />
				</Button>
			{/each}
		{/if}
	</Dropdown>
</div>

<style>
	.settings :global(.dropdown-trigger) {
		width: 40px;
		height: 40px;
		padding: 0;
		border-radius: 50%;
		color: #ddd;
		transition:
			background 120ms,
			rotate 200ms;
	}

	.settings :global(.dropdown-trigger:hover),
	.settings:has(:popover-open) :global(.dropdown-trigger) {
		color: #fff;
	}

	.settings:has(:popover-open) :global(.dropdown-trigger) {
		rotate: 30deg;
	}

	.settings :global(.dropdown-menu) {
		top: auto;
		bottom: anchor(top);
		min-width: 240px;
		max-height: min(60vh, 440px);
		margin: 0 0 8px;
		overflow-y: auto;
		background: rgb(28 28 28 / 0.96);
		color: #e6e6e6;
	}

	.settings :global(.back) {
		padding-left: 10px;
		border-bottom: 1px solid rgb(255 255 255 / 0.08);
		font-weight: 500;
	}

	.settings :global([aria-checked='true']) {
		color: #fff;
	}

	.value {
		margin-left: auto;
		color: #999;
	}

	.check {
		display: inline-grid;
		place-items: center;
		width: 16px;
	}
</style>
