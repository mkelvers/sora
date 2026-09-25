<script lang="ts">
	import type { SeriesImage } from '@sora/sdk';

	type Props = {
		type: SeriesImage['type'];
		sort: 'votes' | 'quality';
	};

	let { type = $bindable(), sort = $bindable() }: Props = $props();

	const types = [
		{
			value: 'poster',
			label: 'Posters'
		},
		{
			value: 'backdrop',
			label: 'Backdrops'
		},
		{
			value: 'logo',
			label: 'Logos'
		}
	] as const;
</script>

<div class="types" role="radiogroup" aria-label="Kind">
	{#each types as option (option.value)}
		<button role="radio" aria-checked={type === option.value} onclick={() => (type = option.value)}>
			{option.label}
		</button>
	{/each}
</div>

<fieldset>
	<legend>Sort by</legend>
	<label>
		<input type="radio" bind:group={sort} value="votes" />
		Most liked
	</label>
	<label>
		<input type="radio" bind:group={sort} value="quality" />
		Best quality
	</label>
</fieldset>

<style>
	.types {
		display: grid;
		gap: 2px;
	}

	.types button {
		padding: 10px 12px;
		border: none;
		border-left: 2px solid transparent;
		background: none;
		color: #999;
		font: inherit;
		font-size: 15px;
		text-align: left;
		cursor: pointer;
	}

	.types button:hover {
		color: #fff;
	}

	.types button[aria-checked='true'] {
		border-left-color: #fff;
		background: #1a1a1a;
		color: #fff;
	}

	fieldset {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-bottom: 8px;
		padding: 0;
		color: #999;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	label {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		cursor: pointer;
	}

	input {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		margin: 0;
		border: 1px solid #555;
		border-radius: 50%;
		background: #161616;
		appearance: none;
		cursor: pointer;
	}

	input:hover {
		border-color: #888;
	}

	input:checked {
		border-color: #e6e6e6;
	}

	input:checked::after {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #e6e6e6;
		content: '';
	}

	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
