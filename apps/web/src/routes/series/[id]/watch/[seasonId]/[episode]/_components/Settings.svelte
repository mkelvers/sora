<script lang="ts" module>
	export type Setting = {
		label: string;
		value: string;
		options: { value: string; label: string }[];
		select: (value: string) => void;
	};
</script>

<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { settings }: { settings: Setting[] } = $props();

	let submenu = $state<string>();
	const open = $derived(settings.find((setting) => setting.label === submenu));

	const current = (setting: Setting) => setting.options.find((option) => option.value === setting.value)?.label;
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
			{#each settings as setting (setting.label)}
				<Button role="menuitem" onclick={() => (submenu = setting.label)}>
					{setting.label}
					<span class="value">{current(setting)}</span>
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
