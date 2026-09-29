<script lang="ts">
	import tmdbLogo from "$lib/assets/tmdb.svg";
	import Button from "$lib/components/ui/Button.svelte";
</script>

<svelte:head>
	<title>About · Sora</title>
	<meta
		name="description"
		content="Where Sora's data comes from, what Sora stores, and its terms"
	/>
</svelte:head>

<article class="mx-auto w-full max-w-3xl px-5 py-12 leading-relaxed text-muted sm:px-10 sm:py-16">
	<h1 class="text-3xl font-bold text-foreground sm:text-4xl">About Sora</h1>
	<p class="mt-4">
		Sora is a place to find, follow and watch anime, with a library and profiles for everyone in
		your household. It is a personal, non-commercial project.
	</p>

	<nav class="mt-8" aria-label="On this page">
		<ul class="flex flex-wrap gap-x-6 gap-y-2">
			<li><Button variant="link" href="#credits">Credits</Button></li>
			<li><Button variant="link" href="#privacy">Privacy</Button></li>
			<li><Button variant="link" href="#terms">Terms</Button></li>
		</ul>
	</nav>

	<section id="credits" class="mt-14 scroll-mt-8" aria-labelledby="credits-heading">
		<h2 id="credits-heading" class="text-xl font-bold text-foreground">Credits</h2>
		<p class="mt-3">Sora doesn't make its own anime data. It comes from these services:</p>

		<ul class="mt-6 space-y-8">
			<li>
				<h3 class="font-bold text-foreground">
					<Button variant="link" href="https://anilist.co" target="_blank" rel="noreferrer">
						AniList
					</Button>
				</h3>
				<p class="mt-1">
					Titles, descriptions, cover art, airing schedules and how seasons, sequels and films
					relate to each other.
				</p>
			</li>
			<li>
				<h3 class="font-bold text-foreground">
					<Button variant="link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
						The Movie Database (TMDB)
					</Button>
				</h3>
				<p class="mt-1">
					Episode titles, summaries and stills, backdrops, logos and season artwork.
				</p>
				<img src={tmdbLogo} alt="The Movie Database (TMDB) logo" class="mt-4 h-3" />
				<p class="mt-3">
					Sora uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by
					TMDB.
				</p>
			</li>
			<li>
				<h3 class="font-bold text-foreground">
					<Button variant="link" href="https://animeschedule.net" target="_blank" rel="noreferrer">
						AnimeSchedule.net
					</Button>
				</h3>
				<p class="mt-1">When English dubs come out, so new dubs show up as soon as they're out.</p>
			</li>
		</ul>

		<p class="mt-8">
			Sora doesn't host any video. Episodes play from third-party sources, which Sora finds and
			streams through its own servers.
		</p>
	</section>

	<section id="privacy" class="mt-14 scroll-mt-8" aria-labelledby="privacy-heading">
		<h2 id="privacy-heading" class="text-xl font-bold text-foreground">Privacy</h2>

		<h3 class="mt-6 font-bold text-foreground">What Sora stores</h3>
		<ul class="mt-3 list-disc space-y-2 pl-5">
			<li>Your account's e-mail address, and your password, which is only ever stored hashed.</li>
			<li>Each profile's name and avatar.</li>
			<li>
				Each profile's library: what's on its watchlist, how far it got in each episode, what it
				watched and when, and which notifications it read or dismissed.
			</li>
			<li>
				For each device you sign in on, the session that keeps you signed in, with the device's IP
				address and browser. A session ends when you sign out, or after 90 days.
			</li>
		</ul>

		<h3 class="mt-6 font-bold text-foreground">Cookies and your device</h3>
		<p class="mt-3">
			Sora sets two cookies, both needed for it to work: one keeps you signed in for up to 90 days,
			and one remembers which profile you picked for an hour. Player settings, such as volume, are
			kept in your browser only.
		</p>

		<h3 class="mt-6 font-bold text-foreground">What Sora doesn't do</h3>
		<p class="mt-3">
			Sora has no ads, analytics or trackers, and never sells or shares your data. Video sources see
			Sora's servers, not your address, since episodes stream through them.
		</p>

		<h3 class="mt-6 font-bold text-foreground">Deleting your data</h3>
		<p class="mt-3">
			You can delete any profile but your last, along with its library, from the profile picker. To
			delete your whole account, ask whoever gave you access to Sora.
		</p>
	</section>

	<section id="terms" class="mt-14 scroll-mt-8" aria-labelledby="terms-heading">
		<h2 id="terms-heading" class="text-xl font-bold text-foreground">Terms</h2>
		<ul class="mt-3 list-disc space-y-2 pl-5">
			<li>
				Sora is personal and non-commercial. Don't use it, or anything it shows, to make money.
			</li>
			<li>Your account is yours alone. Keep your password to yourself.</li>
			<li>
				Episodes come from third-party sources Sora doesn't control, so any episode can stop
				playing, or never become available.
			</li>
			<li>Sora is provided as it is, without any warranty. It may change, or stop, at any time.</li>
			<li>Anime data belongs to the services credited above, and follows their terms.</li>
		</ul>
	</section>

	<p class="mt-14 text-sm text-subtle">Last updated 29 September 2026.</p>
</article>
