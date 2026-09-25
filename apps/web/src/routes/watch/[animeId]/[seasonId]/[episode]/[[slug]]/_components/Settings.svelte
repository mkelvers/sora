<script lang="ts" module>
	export type Setting = {
		label: string;
		value: string;
		options: { value: string; label: string }[];
		select: (value: string) => void;
	};
</script>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let { settings }: { settings: Setting[] } = $props();

	const id = $props.id();
	let expanded = $state(false);
	let submenu = $state<string>();
	const open = $derived(settings.find((setting) => setting.label === submenu));

	const current = (setting: Setting) => setting.options.find((option) => option.value === setting.value)?.label;
</script>

<button
	class="trigger"
	popovertarget={id}
	aria-label="Settings"
	aria-expanded={expanded}
	style:anchor-name="--{id}"
>
	<Icon name="settings" />
</button>

<div
	{id}
	class="menu"
	popover
	style:position-anchor="--{id}"
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		submenu = undefined;
	}}
>
	{#if open}
		<button class="row back" onclick={() => (submenu = undefined)}>
			<Icon name="chevron-left" size="md" />
			{open.label}
		</button>
		<div role="menu" aria-label={open.label}>
			{#each open.options as option (option.value)}
				<button
					class="row"
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
				</button>
			{/each}
		</div>
	{:else}
		{#each settings as setting (setting.label)}
			<button class="row" onclick={() => (submenu = setting.label)}>
				{setting.label}
				<span class="value">{current(setting)}</span>
				<Icon name="chevron-right" size="md" />
			</button>
		{/each}
	{/if}
</div>

<style>
	.trigger {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 50%;
		background: none;
		color: #ddd;
		cursor: pointer;
		transition:
			background 120ms,
			rotate 200ms;
	}

	.trigger:hover,
	.trigger[aria-expanded='true'] {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.trigger[aria-expanded='true'] {
		rotate: 30deg;
	}

	.menu {
		position-area: block-start span-inline-start;
		position-try-fallbacks: flip-block;
		min-width: 240px;
		max-height: min(60vh, 440px);
		margin: 0 0 8px;
		padding: 6px 0;
		border: none;
		border-radius: 8px;
		background: rgb(28 28 28 / 0.96);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
		color: #e6e6e6;
		font-family: system-ui, sans-serif;
		overflow-y: auto;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 16px;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.row:hover,
	.row:focus-visible {
		background: rgb(255 255 255 / 0.08);
		outline: none;
	}

	.value {
		margin-left: auto;
		color: #999;
	}

	.back {
		padding-left: 10px;
		border-bottom: 1px solid rgb(255 255 255 / 0.08);
		font-weight: 500;
	}

	.check {
		display: inline-grid;
		place-items: center;
		width: 16px;
	}

	[aria-checked='true'] {
		color: #fff;
	}
</style>
