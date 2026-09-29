<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
</script>

<footer
	class="flex flex-col gap-2 border-t border-border px-5 py-6 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-10"
>
	<p>
		Anime data from
		<Button variant="link" href="https://anilist.co" target="_blank" rel="noreferrer">
			AniList
		</Button>,
		<Button variant="link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
			TMDB
		</Button>
		and
		<Button variant="link" href="https://animeschedule.net" target="_blank" rel="noreferrer">
			AnimeSchedule.net
		</Button>
	</p>
	<Button variant="link" href="/about">About, privacy and terms</Button>
</footer>
