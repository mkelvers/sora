<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Button from './Button.svelte';

	type Props = HTMLAttributes<HTMLDivElement> & {
		id: string;
		trigger: Snippet;
		children: Snippet;
		/** Accessible name for a trigger without visible text. */
		label?: string;
		alignment?: 'left' | 'right';
	};

	let { id, trigger, children, label, alignment = 'right', class: className, ...props }: Props = $props();
</script>

<div class="dropdown">
	<Button class="dropdown-trigger" variant="ghost" popovertarget={id} aria-label={label}>
		{@render trigger()}
	</Button>

	<div {id} popover class={['dropdown-menu', className]} data-alignment={alignment} {...props}>
		{@render children()}
	</div>
</div>

<style>
	/* Layered so a caller's own styles always win, whatever their specificity. */
	@layer dropdown {
		.dropdown {
			anchor-scope: --dropdown-trigger;
		}

		.dropdown :global(.dropdown-trigger) {
			anchor-name: --dropdown-trigger;
			padding: 8px;
			color: #999;
		}

		.dropdown :global(.dropdown-trigger:hover),
		.dropdown:has(.dropdown-menu:popover-open) :global(.dropdown-trigger) {
			background: rgb(255 255 255 / 0.1);
			color: #fff;
		}

		.dropdown-menu {
			position-anchor: --dropdown-trigger;
			inset: auto;
			top: anchor(bottom);
			z-index: 10;
			min-width: 224px;
			margin: 4px 0 0;
			padding: 6px 0;
			overflow: hidden;
			border: none;
			background: #202020;
			box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
			color: #ccc;
			font-size: 14px;
		}

		.dropdown-menu:popover-open {
			display: flex;
			flex-direction: column;
		}

		.dropdown-menu[data-alignment='left'] {
			left: anchor(left);
		}

		.dropdown-menu[data-alignment='right'] {
			right: anchor(right);
		}

		.dropdown-menu > :global(*) {
			padding: 10px 16px;
		}

		.dropdown-menu > :global(.button) {
			justify-content: flex-start;
			width: 100%;
			text-align: left;
		}

		.dropdown-menu > :global(.button:hover),
		.dropdown-menu > :global(.button:focus-visible) {
			background: rgb(255 255 255 / 0.08);
			color: #fff;
			outline: none;
		}
	}
</style>
