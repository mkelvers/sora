<script lang="ts">
	let { cues }: { cues: VTTCue[] } = $props();
</script>

<div class="captions">
	{#each cues as cue (cue)}
		<p {@attach (element) => element.replaceChildren(cue.getCueAsHTML())}></p>
	{/each}
</div>

<style>
	.captions {
		color: #fff;
		font-size: clamp(18px, 2.6vw, 40px);
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		text-shadow: 0 2px 6px rgb(0 0 0 / 0.6);
		white-space: pre-line;
		pointer-events: none;
		-webkit-text-stroke: 0.14em #000;
		paint-order: stroke fill;
	}

	p {
		margin: 0;
	}
</style>
