<script lang="ts">
	import tmdbLogo from "$lib/assets/tmdb.svg";
	import Button from "$lib/components/ui/Button.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>About · Sora</title>
	<meta name="description" content="Where Sora's anime data comes from" />
</svelte:head>

<article
	class="mx-auto w-full max-w-3xl px-5 py-12 text-lg leading-relaxed text-muted sm:px-10 sm:py-16"
>
	{#if !data.viewer}
		<Button variant="link" href="/login" class="mb-10 text-base">Sign in</Button>
	{/if}

	<h1 class="text-4xl font-bold text-foreground sm:text-5xl">About Sora</h1>
	<p class="mt-6">
		Sora is a place to find, follow and watch anime, with a library and profiles for everyone in
		your household. It keeps track of what you're watching, tells you when new episodes are out, and
		picks up where you left off.
	</p>
	<p class="mt-4">
		Sora doesn't make its own anime data. Everything you see about a series comes from the services
		below, and Sora is grateful to them and the communities that keep them up to date.
	</p>

	<section class="mt-16" aria-labelledby="credits">
		<h2 id="credits" class="text-2xl font-bold text-foreground sm:text-3xl">Credits</h2>

		<ul class="mt-8 space-y-12">
			<li>
				<h3 class="text-xl font-bold text-foreground">
					<Button variant="link" href="https://anilist.co" target="_blank" rel="noreferrer">
						AniList
					</Button>
				</h3>
				<p class="mt-3">
					The heart of Sora's catalogue. AniList provides every title's names, description, genres,
					studios, cover art and score, and knows how seasons, sequels, spin-offs and films relate
					to each other, which is how Sora groups them into one series. Its airing schedules tell
					Sora when each new episode airs, so it can look for the episode the moment it's out.
				</p>
			</li>
			<li>
				<h3 class="text-xl font-bold text-foreground">
					<Button variant="link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
						The Movie Database (TMDB)
					</Button>
				</h3>
				<p class="mt-3">
					How a series splits into seasons, and each episode's title, summary, runtime and still.
					TMDB also provides the backdrops, title logos and season posters you see across Sora.
				</p>
				<img src={tmdbLogo} alt="The Movie Database (TMDB) logo" class="mt-6 h-4" />
				<p class="mt-4 text-base">
					Sora uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by
					TMDB.
				</p>
			</li>
			<li>
				<h3 class="text-xl font-bold text-foreground">
					<Button variant="link" href="https://animeschedule.net" target="_blank" rel="noreferrer">
						AnimeSchedule.net
					</Button>
				</h3>
				<p class="mt-3">
					When English dubs come out. Dubs usually follow the Japanese broadcast by weeks, on a
					schedule of their own, and AnimeSchedule.net tells Sora when each one is due, so a new dub
					shows up as soon as it's out.
				</p>
			</li>
		</ul>
	</section>

	<section class="mt-16" aria-labelledby="video">
		<h2 id="video" class="text-2xl font-bold text-foreground sm:text-3xl">Video</h2>
		<p class="mt-6">
			Sora doesn't host any video. Episodes play from third-party sources, which Sora finds for each
			episode and streams through its own servers. Which versions an episode has, such as sub or
			dub, depends on what those sources carry.
		</p>
	</section>
</article>
