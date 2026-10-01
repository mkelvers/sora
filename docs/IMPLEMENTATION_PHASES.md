# Sora: brugerflow med grupperede serier

Dette dokument beskriver den ønskede brugeroplevelse. Det er et forslag til gennemlæsning, ikke en teknisk implementeringsplan.

## Grundidé

En serie har én samlet entry med sine sæsoner og de film eller specials, der indgår i grupperingen. Brugeren skal kunne finde serien og begynde at se den uden selv at administrere Watching eller Completed.

Sora husker både, hvor brugeren er nået i afspilningen, og hvilke episoder brugeren har afsluttet. Brugeren vælger selv, hvad der skal gemmes til senere, og hvad der skal droppes.

## Shows

Shows er poster-overblikket over brugerens serier. En franchise vises én gang, også selvom brugeren har set flere sæsoner.

- Kortene viser poster, titel og lydlabels.
- En serie bliver i Shows, når brugeren starter eller afslutter den.
- Shows og History er forskellige visninger. Serien skal ikke flyttes fra poster-overblikket over i historikken.
- Brugeren kan tilføje en serie til Shows for at gemme den til senere. En serie, brugeren begynder at se uden først at gemme den, indgår også i overblikket.
- Filteret **Ikke startet** viser gemte serier uden sete episoder og uden afspilningsprogress.
- En serie forlader Ikke startet, så snart brugeren begynder at se den. Den bliver stadig i Shows.

Der skal ikke stå små Watching-, Completed- eller sæsonstatusbeskeder på hvert poster-kort. Eventuelle yderligere filtre er endnu ikke besluttet.

## Når brugeren begynder at se en serie

1. Brugeren åbner serien og starter en episode.
2. Sora gemmer løbende, hvor langt brugeren er nået i videoen.
3. Stopper brugeren midt i episoden, kan afspilningen senere fortsætte fra den gemte position.
4. Når episoden er afsluttet, registrerer Sora den som set i History.
5. Sora bruger progress og sete episoder til at finde det relevante sted at fortsætte, også når brugeren er nået til en senere sæson.

Et besøg på seriens side betyder ikke, at brugeren har startet serien. En halvset episode giver progress, men er endnu ikke en afsluttet episode i History.

## Continue watching

Continue watching er den hurtige vej tilbage til det, brugeren ser.

- Kortet fører til den aktuelle episode og dens gemte position eller den næste relevante episode.
- Kortet skal vise den rigtige sæson og episode, så brugeren kan genkende, hvor vedkommende er nået til.
- Brugeren kan fjerne kortet uden at slette progress eller History.
- Fjernelse af et kort betyder ikke, at hele serien er droppet.
- Serien kan stadig findes i Shows eller via søgning, og dens gemte progress kan stadig bruges.

## History

History er en kronologisk liste over afsluttede episoder, nyeste først. Den er ikke en samling af franchise-posters.

Hver registrering fortæller, hvilken serie, sæson og episode brugeren har set, og hvornår den første gang blev registreret som afsluttet.

- En episode tilføjes, når den er afsluttet.
- Samme episode registreres én gang.
- Genafspilning opretter ikke endnu en registrering og flytter ikke den gamle til toppen.
- At droppe en serie eller fjerne dens Continue watching-kort sletter ikke historikken.

## Intern completion

Sora beregner completion automatisk. Brugeren skal ikke selv markere en sæson eller franchise som Completed.

- En sæson er gennemført, når den er færdig med at udkomme, og alle dens episoder er registreret som set.
- Den samlede serie er internt gennemført, når alle de udgivelser, der tæller med i grupperingen, er afsluttet og set.
- Mens en sæson stadig udkommer, er serien ikke gennemført, selvom brugeren har set den senest udgivne episode.
- Når den sæson er afsluttet, og brugeren har set alle dens episoder, bliver serien internt gennemført igen.
- En ny sæson, der begynder at udkomme, gør den samlede serie ufuldstændig igen. Tidligere sete sæsoner og episoder bliver bevaret.
- En annonceret sæson, der endnu ikke er begyndt at udkomme, ændrer ikke den aktuelle completion.

Completion er her en intern oplysning. Dokumentet fastlægger ikke en synlig statuslabel eller et Completed-filter i Shows.

## Genafspilning

Brugeren kan altid se en episode igen. Sora gemmer den nye afspilningsposition, så også en genafspilning kan fortsættes senere.

Episoden bliver ved med at være set i History. En delvis genafspilning gør ikke tidligere sete episoder eller gennemførte sæsoner usete. Historikken ændres kun ved en særskilt, eksplicit sletning; den funktion er uden for dette dokument.

## Dropped

Dropped er et bevidst valg, som gælder hele den grupperede serie. Brugeren dropper ikke en enkelt sæson.

- Progress og History bevares.
- Serien fjernes fra Continue watching og undertrykkes i personlige anbefalinger og hero-visninger.
- Nye episoder eller sæsoner ophæver ikke automatisk Drop.
- Serien kan stadig findes via søgning og dens eksisterende episodehistorik.
- Brugeren skal kunne ophæve Drop igen.

## Eksempel

Brugeren ser alle 24 episoder af sæson 1 og derefter alle 24 episoder af sæson 2. Begge sæsoner er afsluttet, så Sora betragter serien som gennemført internt. Shows har stadig ét poster-kort, mens History har de afsluttede episoder i kronologisk rækkefølge.

Sæson 3 begynder at udkomme. Serien er nu ikke længere gennemført, men historikken fra sæson 1 og 2 er uændret. Brugeren ser de nye episoder løbende. Når sæson 3 er afsluttet, og alle dens episoder er set, er serien gennemført igen.

Dropper brugeren serien, bevares alle de sete episoder. Serien foreslås ikke længere på de personlige anbefalingsflader.

## Det, der stadig skal afklares

- Hvilke film, OVAs og specials skal tælle med i den samlede completion?
- Skal Shows have flere filtre end Ikke startet? Det visuelle overblik over gennemførte franchises er endnu ikke løst eller besluttet.
- Hvordan skal droppede serier kunne findes i Shows, og hvordan skal genoptagelse se ud?
