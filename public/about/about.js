// Vispecta – about page: language (English in the HTML; Danish, German, Swedish, Norwegian, Dutch,
// French and Spanish here), image zoom
// and a gentle reveal on scroll. The language is shared with the app (same storage key).
(() => {
  // Rasmus' LinkedIn profile; the links stay hidden while this is empty
  const LINKEDIN = 'https://www.linkedin.com/in/rasmus-roien-molb%C3%A6k-71647085';

  const T = {
    da: {
      'nav.features': 'Funktioner', 'nav.privacy': 'Privatliv', 'nav.faq': 'Spørgsmål', 'nav.lang': 'Sprog',
      'cta.open': 'Åbn Vispecta', 'cta.github': 'Kildekoden på GitHub',
      'hero.eyebrow': 'IFC-viewer til infrastruktur',
      'hero3d.alt': 'Dobbeltspor-eksemplet i 3D, skåret af et tværsnit på broen ved 12+205: det skraverede brodæk med begge spor, rækværket og åen nedenunder',
      'hero.title': 'Snit, stationer og profiler – direkte fra dine IFC-modeller.',
      'hero.lead': 'Vispecta åbner IFC-modeller i browseren og laver tværsnit, længdeprofiler og tegninger – skabt til bane- og vejprojekter. Gratis, open source, og dine filer forlader aldrig din computer.',
      'fact.free': 'Gratis', 'fact.oss': 'Open source · AGPL-3.0', 'fact.local': 'Kører lokalt',
      'story.quote': '“Som ingeniør i jernbaneprojekter sprang jeg konstant mellem programmer for at lave et snit, tjekke en model eller finde rundt langs linjeføringen. Vispecta samler de værktøjer, jeg manglede, ét sted – i browseren, uden at installere noget.”',
      'story.role': 'Jernbaneingeniør og ophavsmand til Vispecta',
      'feat.title': 'Lavet til den måde, infrastruktur bliver læst på',
      'feat.lead': 'Linjeføringer, stationer og tværsnit er bane- og vejfagets sprog. Vispecta taler det.',
      'f1.tag': 'Linjeføring & stationering', 'f1.title': 'Snit ved enhver station',
      'f1.text': 'Vispecta læser IFC 4.3-linjeføringer med stationering. Skriv en station, og få et tværsnit præcis dér – med klassiske A–A-snitpile i modellen – eller kør langs sporet. Ingen linjeføring i filen? Tegn en linje, og brug den på samme måde.',
      'f1.l1': 'IfcAlignment med stationsmærker og kilometerpæle', 'f1.l2': 'Skraverede snitflader i modellens farver', 'f1.l3': 'Bladr mellem stationer med piletasterne',
      'f2.tag': 'Snitvindue', 'f2.title': 'Se plan og snit side om side',
      'f2.text': 'Snitvinduet viser det levende 2D-snit, mens du bevæger dig gennem modellen. Sæt det på en skærm nummer to, aflæs afstande og koter i knækpunkterne, og lad nøgleplanen vise, hvor du er.',
      'f2.l1': 'Afstand / kote i hvert knækpunkt', 'f2.l2': 'Nøgleplan med snitlinje og kigretning', 'f2.l3': 'Kan åbnes i sit eget vindue',
      'f3.tag': 'Tegninger', 'f3.title': 'Fra model til tegning med ét klik',
      'f3.text': 'Eksportér snit som PDF, SVG eller DXF – i målestok, med titelblok, visningen bag snittet og et bånd med afstande, koter og hældninger. Lav en hel serie tværsnit i én PDF.',
      'f3.l1': 'PDF, SVG og DXF med lag', 'f3.l2': 'Annoteringsbånd: afstand, kote, hældning', 'f3.l3': 'Én side pr. station i en serie',
      'f4.tag': 'Længdeprofiler', 'f4.title': 'Fold modellen ud langs linjen',
      'f4.text': 'Et længdeprofil langs en linjeføring eller en linje, du selv tegner fra A til B: alt, hvad linjen passerer, foldet ud med stationer og koter – klar til eksport.',
      'f5.tag': 'Mange modeller, én visning', 'f5.title': 'Saml fagene',
      'f5.text': 'Indlæs spor, vej, bro og bygning på én gang – placeret efter deres koordinater. Saml dem i grupper, giv dem navne, du kan genkende, tænd og sluk hele grupper, flet dem til én fil, eller sammenlign to versioner.',
      'f6.tag': 'Modelkontrol', 'f6.title': 'Tjek informationerne, ikke kun geometrien',
      'f6.text': 'Kør IDS-tjek (buildingSMART Information Delivery Specification) med IfcOpenShells ifctester, se hvad der består og fejler i modellen, og skriv sager som BCF. Eksempler på IDS-filer følger med.',
      'f7.tag': 'Terræn & jordarbejde', 'f7.title': 'Fra opmåling til afgravning og opfyld',
      'f7.text': 'Byg et terræn ud fra en punktsky – med et terrænfilter, der fjerner træer og bygninger – eller åbn en højdemodel (GeoTIFF, fx DHM) eller en LandXML-flade. Farv det efter kote, tegn kurver, og sammenlign med dæmningen: afgravning og opfyld pr. stationsinterval som tabel, CSV og kort i 3D.',
      'f7.l1': 'Terræn (TIN) fra punktskyer, GeoTIFF og LandXML', 'f7.l2': 'Kurver i 3D og i plantegninger', 'f7.l3': 'Afgravning og opfyld langs en linjeføring – og eksport som LandXML',
      'f8.tag': 'Punktskyer & koordinater', 'f8.title': 'Opmålinger og modeller i ét koordinatsystem',
      'f8.text': 'Åbn laserscanninger og opmålinger sammen med modellerne: LAS, LAZ, E57 – og cloud-optimerede COPC-filer med milliarder af punkter, hvor kun det, du kigger på, indlæses. Punkterne vises i alle snit. Modeller, punktskyer og terræn i forskellige koordinatsystemer (UTM 32/33, DKTM, Kp2000, Gauss-Krüger, DB_REF eller en vilkårlig EPSG-kode) omregnes til projektets system on the fly.',
      'f8.l1': 'COPC-streaming, E57 med flere opstillinger', 'f8.l2': 'Punkter i snit, profiler og tegninger', 'f8.l3': 'Omregning mellem koordinatsystemer on the fly',
      'g1.t': 'Mål', 'g1.d': 'Afstande, koter og koordinater med snap – også i kortkoordinater.',
      'g2.t': 'Mængder', 'g2.d': 'Antal, volumen, areal og længde pr. klasse, etage eller egenskab – til CSV.',
      'g3.t': 'Sammenlign & flet', 'g3.d': 'Se hvad der er tilføjet, fjernet eller ændret mellem to versioner. Flet modeller til én IFC.',
      'g4.t': 'Python indbygget', 'g4.d': 'Skriv scripts mod modellen med IfcOpenShell, direkte i browseren.',
      'g5.t': 'Ret metadata', 'g5.d': 'Ret navne og egenskaber, og download den rettede IFC.',
      'g6.t': 'Farveblind-venlig', 'g6.d': 'En farvestil baseret på Okabe–Ito-paletten, plus afdæmpet, lys og kraftig.',
      'g7.t': 'Virker offline', 'g7.d': 'Installér den som app. Efter første besøg starter den uden forbindelse.',
      'g8.t': 'Ni sprog', 'g8.d': 'Engelsk, dansk, tysk, svensk, norsk, nederlandsk, fransk, spansk og hindi.',
      'priv.eyebrow': 'Privatliv indbygget', 'priv.title': 'Dine modeller bliver på din computer.',
      'priv.text': 'Vispecta har ingen server, der ser dine filer. Alt – at læse IFC, lave snit, tjekke IDS og køre Python – sker i din browser med WebAssembly.',
      'priv.l1t': 'Ingen upload', 'priv.l1': 'IFC-, BCF- og IDS-filer behandles lokalt.',
      'priv.l2t': 'Ingen sporing', 'priv.l2': 'Ingen cookies, ingen statistik, ingen konti.',
      'priv.l3t': 'Gemt i din browser', 'priv.l3': 'Projekter og indstillinger bliver kun i denne browser.',
      'priv.l4t': 'Selvforsynende', 'priv.l4': 'Appen, skrifttyperne og Python-delen hentes alle fra vispecta.com selv.',
      'faq.title': 'Spørgsmål',
      'q1': 'Er det gratis?', 'a1': 'Ja. Vispecta er gratis at bruge – også på arbejdet og i kommercielle projekter.',
      'q2': 'Hvad betyder open source under AGPL-3.0 for mig?', 'a2': 'Du kan bruge Vispecta frit og se al koden. Hvis nogen ændrer den og deler den – eller kører en ændret version som tjeneste – skal de offentliggøre ændringerne under samme licens. Så ingen kan tage den, lukke den og sælge den som deres egen.',
      'q3': 'Bliver mine filer uploadet nogen steder?', 'a3': 'Nej. Filerne læses og behandles i din browser. Intet om dine modeller sendes til vispecta.com eller andre.',
      'q4': 'Hvilke IFC-versioner virker?', 'a4': 'IFC 2x3, IFC 4 og IFC 4.3 (inklusive IfcAlignment). Store modeller på flere hundrede MB virker i en browser på en computer med nok hukommelse.',
      'q5': 'Hvad betyder “beta”?', 'a5': 'Vispecta er nyt og i vækst. Ikke alle funktioner er testet på alle slags modeller, så der kan være fejl – meld dem gerne.',
      'q6': 'Hvilken browser skal jeg bruge?', 'a6': 'En opdateret Chrome, Edge, Firefox eller Safari på en computer. Telefoner og tablets kan vise modeller, men værktøjerne er lavet til en større skærm.',
      'con.title': 'Vær med til at forme Vispecta', 'con.text': 'Idéer fra rigtige projekter giver de bedste funktioner. Fortæl hvad du mangler, meld en fejl, eller bidrag med kode.',
      'con.idea': 'Del en idé eller en fejl', 'con.code': 'Bidrag med kode',
      'foot.credit': 'Skærmbillederne viser en øvelsesmodel af et dobbeltspor og IFC 4.3-eksempelscenen fra buildingSMART International (CC BY 4.0).',
      _title: 'Om Vispecta – en gratis IFC-viewer til bane- og vejprojekter',
    },
    de: {
      'nav.features': 'Funktionen', 'nav.privacy': 'Datenschutz', 'nav.faq': 'Fragen', 'nav.lang': 'Sprache',
      'cta.open': 'Vispecta öffnen', 'cta.github': 'Quellcode auf GitHub',
      'hero.eyebrow': 'IFC-Viewer für Infrastruktur',
      'hero3d.alt': 'Das zweigleisige Beispiel in 3D, durch einen Querschnitt auf der Brücke bei 12+205 geschnitten: das schraffierte Brückendeck mit beiden Gleisen, das Geländer und der Bach darunter',
      'hero.title': 'Schnitte, Stationen und Profile – direkt aus Ihren IFC-Modellen.',
      'hero.lead': 'Vispecta öffnet IFC-Modelle im Browser und macht daraus Querschnitte, Längsprofile und Zeichnungen – gemacht für Bahn- und Straßenprojekte. Kostenlos, Open Source, und Ihre Dateien verlassen nie Ihren Computer.',
      'fact.free': 'Kostenlos', 'fact.oss': 'Open Source · AGPL-3.0', 'fact.local': 'Läuft lokal',
      'story.quote': '„Als Ingenieur in Bahnprojekten bin ich ständig zwischen Programmen gewechselt, um einen Schnitt zu machen, ein Modell zu prüfen oder mich entlang der Achse zurechtzufinden. Vispecta bringt die Werkzeuge, die mir gefehlt haben, an einen Ort – im Browser, ohne Installation.“',
      'story.role': 'Bahningenieur und Autor von Vispecta',
      'feat.title': 'Gemacht dafür, wie Infrastruktur gelesen wird',
      'feat.lead': 'Achsen, Stationen und Querschnitte sind die Sprache von Bahn und Straße. Vispecta spricht sie.',
      'f1.tag': 'Achsen & Stationierung', 'f1.title': 'Schnitt an jeder Station',
      'f1.text': 'Vispecta liest IFC-4.3-Achsen mit ihrer Stationierung. Geben Sie eine Station ein und erhalten Sie genau dort einen Querschnitt – mit klassischen Schnittpfeilen A–A im Modell – oder fahren Sie das Gleis entlang. Keine Achse in der Datei? Zeichnen Sie eine Linie und nutzen Sie sie genauso.',
      'f1.l1': 'IfcAlignment mit Stationsbeschriftung und Kilometersteinen', 'f1.l2': 'Schraffierte Schnittflächen in den Modellfarben', 'f1.l3': 'Mit den Pfeiltasten durch die Stationen',
      'f2.tag': 'Schnittfenster', 'f2.title': 'Lageplan und Schnitt nebeneinander',
      'f2.text': 'Das Schnittfenster zeigt den Live-2D-Schnitt, während Sie sich durch das Modell bewegen. Legen Sie es auf einen zweiten Bildschirm, lesen Sie Abstände und Höhen an den Knickpunkten ab, und der Übersichtsplan zeigt, wo Sie sind.',
      'f2.l1': 'Abstand / Höhe an jedem Knickpunkt', 'f2.l2': 'Übersichtsplan mit Schnittlinie und Blickrichtung', 'f2.l3': 'Auf Wunsch in einem eigenen Fenster',
      'f3.tag': 'Zeichnungen', 'f3.title': 'Vom Modell zur Zeichnung mit einem Klick',
      'f3.text': 'Exportieren Sie Schnitte als PDF, SVG oder DXF – maßstäblich, mit Schriftfeld, der Ansicht hinter dem Schnitt und einem Band mit Abständen, Höhen und Neigungen. Eine ganze Querschnittsserie in einer PDF.',
      'f3.l1': 'PDF, SVG und DXF mit Layern', 'f3.l2': 'Beschriftungsband: Abstand, Höhe, Neigung', 'f3.l3': 'Eine Seite pro Station in einer Serie',
      'f4.tag': 'Längsprofile', 'f4.title': 'Das Modell entlang der Linie abwickeln',
      'f4.text': 'Ein Längsprofil entlang einer Achse oder einer selbst gezeichneten Linie von A nach B: alles, was die Linie durchläuft, abgewickelt mit Stationen und Höhen – bereit zum Export.',
      'f5.tag': 'Viele Modelle, eine Ansicht', 'f5.title': 'Die Fachbereiche zusammenbringen',
      'f5.text': 'Laden Sie Gleis, Straße, Brücke und Gebäude gemeinsam – platziert nach ihren Koordinaten. Gruppieren Sie sie, geben Sie ihnen vertraute Namen, schalten Sie ganze Gruppen ein und aus, führen Sie sie zu einer Datei zusammen oder vergleichen Sie zwei Versionen.',
      'f6.tag': 'Modellprüfung', 'f6.title': 'Die Informationen prüfen, nicht nur die Geometrie',
      'f6.text': 'Führen Sie IDS-Prüfungen (buildingSMART Information Delivery Specification) mit dem ifctester von IfcOpenShell aus, sehen Sie im Modell, was besteht und was nicht, und schreiben Sie Themen als BCF. Beispiel-IDS-Dateien sind enthalten.',
      'f7.tag': 'Gelände & Erdbau', 'f7.title': 'Von der Vermessung zu Auftrag und Abtrag',
      'f7.text': 'Erzeugen Sie ein Gelände aus einer Punktwolke – mit einem Bodenfilter, der Bäume und Gebäude entfernt – oder öffnen Sie ein Höhenmodell (GeoTIFF) oder eine LandXML-Fläche. Färben Sie es nach Höhe, zeichnen Sie Höhenlinien und vergleichen Sie es mit dem Damm: Auftrag und Abtrag je Stationsbereich als Tabelle, CSV und Karte in 3D.',
      'f7.l1': 'Gelände (TIN) aus Punktwolken, GeoTIFF und LandXML', 'f7.l2': 'Höhenlinien in 3D und in Lageplänen', 'f7.l3': 'Auftrag und Abtrag entlang einer Achse – auch als LandXML-Export',
      'f8.tag': 'Punktwolken & Koordinaten', 'f8.title': 'Vermessung und Modelle in einem Koordinatensystem',
      'f8.text': 'Öffnen Sie Laserscans und Vermessungen zusammen mit den Modellen: LAS, LAZ, E57 – und cloud-optimierte COPC-Dateien mit Milliarden Punkten, von denen nur geladen wird, was Sie ansehen. Die Punkte erscheinen in jedem Schnitt. Modelle, Punktwolken und Gelände in verschiedenen Koordinatensystemen (UTM 32/33, Gauß-Krüger, DB_REF, DKTM, Kp2000 oder ein beliebiger EPSG-Code) werden laufend ins System des Projekts umgerechnet.',
      'f8.l1': 'COPC-Streaming, E57 mit mehreren Standpunkten', 'f8.l2': 'Punkte in Schnitten, Profilen und Zeichnungen', 'f8.l3': 'Umrechnung zwischen Koordinatensystemen im laufenden Betrieb',
      'g1.t': 'Messen', 'g1.d': 'Abstände, Höhen und Koordinaten mit Fang – auch in Landeskoordinaten.',
      'g2.t': 'Mengen', 'g2.d': 'Anzahl, Volumen, Fläche und Länge pro Klasse, Geschoss oder Eigenschaft – als CSV.',
      'g3.t': 'Vergleichen & zusammenführen', 'g3.d': 'Sehen, was zwischen zwei Versionen hinzugekommen, entfernt oder geändert ist. Modelle zu einer IFC zusammenführen.',
      'g4.t': 'Python inklusive', 'g4.d': 'Das Modell mit IfcOpenShell skripten, direkt im Browser.',
      'g5.t': 'Metadaten bearbeiten', 'g5.d': 'Namen und Eigenschaften korrigieren und die korrigierte IFC herunterladen.',
      'g6.t': 'Farbenblind-freundlich', 'g6.d': 'Ein Farbstil auf Basis der Okabe–Ito-Palette, dazu gedämpft, hell und kräftig.',
      'g7.t': 'Funktioniert offline', 'g7.d': 'Als App installieren. Nach dem ersten Besuch startet sie ohne Verbindung.',
      'g8.t': 'Neun Sprachen', 'g8.d': 'Englisch, Dänisch, Deutsch, Schwedisch, Norwegisch, Niederländisch, Französisch, Spanisch und Hindi.',
      'priv.eyebrow': 'Datenschutz eingebaut', 'priv.title': 'Ihre Modelle bleiben auf Ihrem Computer.',
      'priv.text': 'Vispecta hat keinen Server, der Ihre Dateien sieht. Alles – IFC lesen, Schnitte erzeugen, IDS prüfen, Python ausführen – geschieht in Ihrem Browser mit WebAssembly.',
      'priv.l1t': 'Kein Upload', 'priv.l1': 'IFC-, BCF- und IDS-Dateien werden lokal verarbeitet.',
      'priv.l2t': 'Kein Tracking', 'priv.l2': 'Keine Cookies, keine Statistik, keine Konten.',
      'priv.l3t': 'Im Browser gespeichert', 'priv.l3': 'Projekte und Einstellungen bleiben nur in diesem Browser.',
      'priv.l4t': 'Eigenständig', 'priv.l4': 'App, Schriften und Python-Laufzeit kommen alle von vispecta.com selbst.',
      'faq.title': 'Fragen',
      'q1': 'Ist es kostenlos?', 'a1': 'Ja. Vispecta ist kostenlos – auch bei der Arbeit und in kommerziellen Projekten.',
      'q2': 'Was bedeutet Open Source unter AGPL-3.0 für mich?', 'a2': 'Sie können Vispecta frei nutzen und den gesamten Code einsehen. Wer es ändert und weitergibt – oder eine geänderte Version als Dienst betreibt – muss die Änderungen unter derselben Lizenz veröffentlichen. So kann niemand es nehmen, verschließen und als eigenes Produkt verkaufen.',
      'q3': 'Werden meine Dateien irgendwo hochgeladen?', 'a3': 'Nein. Die Dateien werden in Ihrem Browser gelesen und verarbeitet. Nichts über Ihre Modelle wird an vispecta.com oder andere gesendet.',
      'q4': 'Welche IFC-Versionen funktionieren?', 'a4': 'IFC 2x3, IFC 4 und IFC 4.3 (einschließlich IfcAlignment). Große Modelle von mehreren hundert MB funktionieren in einem Desktop-Browser mit genug Arbeitsspeicher.',
      'q5': 'Was bedeutet „Beta“?', 'a5': 'Vispecta ist neu und wächst. Nicht jede Funktion wurde mit jeder Art von Modell getestet, rechnen Sie also mit einzelnen Fehlern – und melden Sie sie bitte.',
      'q6': 'Welchen Browser brauche ich?', 'a6': 'Ein aktuelles Chrome, Edge, Firefox oder Safari auf einem Computer. Telefone und Tablets können Modelle anzeigen, die Werkzeuge sind aber für einen größeren Bildschirm gemacht.',
      'con.title': 'Gestalten Sie Vispecta mit', 'con.text': 'Ideen aus echten Projekten ergeben die besten Funktionen. Sagen Sie uns, was Sie brauchen, melden Sie einen Fehler oder tragen Sie Code bei.',
      'con.idea': 'Idee oder Fehler melden', 'con.code': 'Code beitragen',
      'foot.credit': 'Die Bildschirmfotos zeigen ein Übungsmodell einer zweigleisigen Strecke und die IFC-4.3-Beispielszene von buildingSMART International (CC BY 4.0).',
      _title: 'Über Vispecta – ein kostenloser IFC-Viewer für Bahn- und Straßenprojekte',
    },
    sv: {
      'nav.features': 'Funktioner',
      'nav.privacy': 'Integritet',
      'nav.faq': 'Frågor',
      'nav.lang': 'Språk',
      'cta.open': 'Öppna Vispecta',
      'cta.github': 'Källkoden på GitHub',
      'hero.eyebrow': 'IFC-visare för infrastruktur',
      'hero3d.alt': 'Exemplet med dubbelspårig järnväg i 3D, skuret av en tvärsektion på bron vid 12+205: det skrafferade brodäcket med båda spåren, räckena och bäcken nedanför',
      'hero.title': 'Tvärsektioner, längdmätning och profiler – direkt från dina IFC-modeller.',
      'hero.lead': 'Vispecta öppnar IFC-modeller i webbläsaren och gör tvärsektioner, längdprofiler och ritningar av dem – skapat för järnvägs- och vägprojekt. Gratis, öppen källkod, och dina filer lämnar aldrig din dator.',
      'fact.free': 'Gratis',
      'fact.oss': 'Öppen källkod · AGPL-3.0',
      'fact.local': 'Körs lokalt',
      'story.quote': '”Som ingenjör i järnvägsprojekt hoppade jag hela tiden mellan program för att ta fram ett snitt, kontrollera en modell eller hitta rätt längs linjeföringen. Vispecta samlar verktygen jag saknade på ett ställe – i webbläsaren, utan att installera något.”',
      'story.role': 'Järnvägsingenjör och upphovsman till Vispecta',
      'feat.title': 'Gjort för hur infrastruktur läses',
      'feat.lead': 'Linjeföringar, sektioner och tvärsektioner är järnvägens och vägens språk. Vispecta talar det.',
      'f1.tag': 'Linjeföring och längdmätning',
      'f1.title': 'Snitt vid valfri sektion',
      'f1.text': 'Vispecta läser IFC 4.3-linjeföringar med deras längdmätning. Skriv en sektion och få en tvärsektion precis där, med klassiska snittmarkeringar A–A i modellen – eller kör längs spåret. Ingen linjeföring i filen? Rita en linje och använd den på samma sätt.',
      'f1.l1': 'IfcAlignment med sektionsetiketter och kilometerstolpar',
      'f1.l2': 'Skrafferade snittytor i modellens färger',
      'f1.l3': 'Stega mellan sektioner med piltangenterna',
      'f2.tag': 'Snittfönster',
      'f2.title': 'Se planen och snittet sida vid sida',
      'f2.text': 'Snittfönstret visar det levande 2D-snittet medan du rör dig genom modellen. Lägg det på en andra skärm, läs av sidoavstånd och höjder i brytpunkterna och låt nyckelplanen visa var du är.',
      'f2.l1': 'Sidoavstånd / höjd i varje brytpunkt',
      'f2.l2': 'Nyckelplan med snittlinje och blickriktning',
      'f2.l3': 'Kan öppnas i ett eget fönster',
      'f3.tag': 'Ritningar',
      'f3.title': 'Från modell till ritning med ett klick',
      'f3.text': 'Exportera snitt som PDF, SVG eller DXF – i skala, med namnruta, vyn bakom snittet och ett band med sidoavstånd, höjder och lutningar. Gör en hel serie tvärsektioner i en PDF.',
      'f3.l1': 'PDF, SVG och DXF med lager',
      'f3.l2': 'Annoteringsband: sidoavstånd, höjd, lutning',
      'f3.l3': 'En sida per sektion i en serie',
      'f4.tag': 'Längdprofiler',
      'f4.title': 'Veckla ut modellen längs linjen',
      'f4.text': 'En längdprofil längs en linjeföring eller en linje du själv ritar från A till B: allt som linjen passerar, utvecklat med sektioner och höjder – och klart att exportera.',
      'f5.tag': 'Många modeller, en vy',
      'f5.title': 'Samla disciplinerna',
      'f5.text': 'Läs in spåret, vägen, bron och byggnaden på en gång – placerade efter sina koordinater. Gruppera dem, ge dem namn du känner igen, slå på och av hela grupper, slå ihop dem till en fil eller jämför två versioner.',
      'f6.tag': 'Modellkontroll',
      'f6.title': 'Kontrollera informationen, inte bara geometrin',
      'f6.text': 'Kör IDS-kontroller (buildingSMART Information Delivery Specification) med IfcOpenShells ifctester, se vad som är godkänt och underkänt i modellen och skriv ärenden som BCF. Exempel på IDS-filer ingår.',
      'f7.tag': 'Terräng och markarbeten',
      'f7.title': 'Från inmätning till schakt och fyllning',
      'f7.text': 'Bygg en terräng från ett punktmoln – med ett markfilter som tar bort träd och byggnader – eller öppna en höjdmodell (GeoTIFF, t.ex. danska DHM) eller en LandXML-yta. Färga den efter höjd, rita höjdkurvor och jämför med banken: schakt och fyllning per sektionsintervall, som tabell, CSV och karta i 3D.',
      'f7.l1': 'Terräng (TIN) från punktmoln, GeoTIFF och LandXML',
      'f7.l2': 'Höjdkurvor i 3D och i planritningar',
      'f7.l3': 'Schakt och fyllning längs en linjeföring – och export som LandXML',
      'f8.tag': 'Punktmoln och koordinater',
      'f8.title': 'Inmätningar och modeller i ett koordinatsystem',
      'f8.text': 'Öppna laserskanningar och inmätningar bredvid modellerna: LAS, LAZ, E57 – och molnoptimerade COPC-filer med miljarder punkter, där bara det du tittar på läses in. Punkterna syns i varje snitt. Modeller, punktmoln och terräng i olika koordinatsystem (UTM 32/33, DKTM, Kp2000, Gauss-Krüger, DB_REF eller valfri EPSG-kod) konverteras till projektets system i farten.',
      'f8.l1': 'COPC-strömning, E57 med flera uppställningar',
      'f8.l2': 'Punkter i snitt, profiler och ritningar',
      'f8.l3': 'Konvertering mellan koordinatsystem i farten',
      'g1.t': 'Mät',
      'g1.d': 'Avstånd, höjder och koordinater med fästning – även i kartkoordinater.',
      'g2.t': 'Mängder',
      'g2.d': 'Antal, volym, area och längd per klass, våningsplan eller valfri egenskap – till CSV.',
      'g3.t': 'Jämför och slå ihop',
      'g3.d': 'Se vad som lagts till, tagits bort eller ändrats mellan två versioner. Slå ihop modeller till en IFC.',
      'g4.t': 'Python inbyggt',
      'g4.d': 'Skripta modellen med IfcOpenShell, direkt i webbläsaren.',
      'g5.t': 'Redigera metadata',
      'g5.d': 'Rätta namn och egenskaper och ladda ner den rättade IFC-filen.',
      'g6.t': 'Färgblindvänlig',
      'g6.d': 'En färgstil baserad på Okabe–Ito-paletten, plus dämpad, ljus och kraftig stil.',
      'g7.t': 'Fungerar offline',
      'g7.d': 'Installera den som app. Efter första besöket startar den utan uppkoppling.',
      'g8.t': 'Nio språk',
      'g8.d': 'Engelska, danska, tyska, svenska, norska, nederländska, franska, spanska och hindi.',
      'priv.eyebrow': 'Integritet inbyggd',
      'priv.title': 'Dina modeller stannar på din dator.',
      'priv.text': 'Vispecta har ingen server som ser dina filer. Allt – att läsa IFC, ta fram snitt, kontrollera IDS och köra Python – sker i din webbläsare med WebAssembly.',
      'priv.l1t': 'Ingen uppladdning',
      'priv.l1': 'IFC-, BCF- och IDS-filer behandlas lokalt.',
      'priv.l2t': 'Ingen spårning',
      'priv.l2': 'Inga cookies, ingen statistik, inga konton.',
      'priv.l3t': 'Sparat i din webbläsare',
      'priv.l3': 'Projekt och inställningar stannar bara i den här webbläsaren.',
      'priv.l4t': 'Självförsörjande',
      'priv.l4': 'Appen, typsnitten och Python-miljön hämtas alla från vispecta.com själv.',
      'faq.title': 'Frågor',
      'q1': 'Är det gratis?',
      'a1': 'Ja. Vispecta är gratis att använda – även i arbetet och i kommersiella projekt.',
      'q2': 'Vad innebär öppen källkod under AGPL-3.0 för mig?',
      'a2': 'Du kan använda Vispecta fritt och se all kod. Om någon ändrar den och delar den – eller kör en ändrad version som tjänst – måste de publicera sina ändringar under samma licens. Så ingen kan ta den, stänga den och sälja den som sin egen.',
      'q3': 'Laddas mina filer upp någonstans?',
      'a3': 'Nej. Filerna läses och behandlas i din webbläsare. Inget om dina modeller skickas till vispecta.com eller någon annan.',
      'q4': 'Vilka IFC-versioner fungerar?',
      'a4': 'IFC 2x3, IFC 4 och IFC 4.3 (inklusive IfcAlignment). Stora modeller på flera hundra MB fungerar i en webbläsare på en dator med tillräckligt minne.',
      'q5': 'Vad betyder ”beta”?',
      'a5': 'Vispecta är nytt och växer. Alla funktioner har inte testats på alla slags modeller, så räkna med ett och annat fel – och rapportera det gärna.',
      'q6': 'Vilken webbläsare behöver jag?',
      'a6': 'En aktuell Chrome, Edge, Firefox eller Safari på en dator. Telefoner och surfplattor kan visa modeller, men verktygen är gjorda för en större skärm.',
      'con.title': 'Var med och forma Vispecta',
      'con.text': 'Idéer från verkliga projekt ger de bästa funktionerna. Berätta vad du saknar, rapportera ett fel eller bidra med kod.',
      'con.idea': 'Dela en idé eller ett fel',
      'con.code': 'Bidra med kod',
      'foot.credit': 'Skärmbilderna visar en övningsmodell av en dubbelspårig järnväg och IFC 4.3-exempelscenen från buildingSMART International (CC BY 4.0).',
      _title: 'Om Vispecta – en gratis IFC-visare för järnvägs- och vägprojekt',
    },
    nb: {
      'nav.features': 'Funksjoner',
      'nav.privacy': 'Personvern',
      'nav.faq': 'Spørsmål',
      'nav.lang': 'Språk',
      'cta.open': 'Åpne Vispecta',
      'cta.github': 'Kildekoden på GitHub',
      'hero.eyebrow': 'IFC-viser for infrastruktur',
      'hero3d.alt': 'Dobbeltsporeksemplet i 3D, skåret av et tverrprofil på brua ved 12+205: det skraverte brudekket med begge sporene, rekkverkene og bekken under',
      'hero.title': 'Snitt, profilnummer og profiler – rett fra IFC-modellene dine.',
      'hero.lead': 'Vispecta åpner IFC-modeller i nettleseren og lager tverrprofiler, lengdeprofiler og tegninger av dem – laget for jernbane- og vegprosjekter. Gratis, åpen kildekode, og filene dine forlater aldri datamaskinen din.',
      'fact.free': 'Gratis',
      'fact.oss': 'Åpen kildekode · AGPL-3.0',
      'fact.local': 'Kjører lokalt',
      'story.quote': '«Som ingeniør i jernbaneprosjekter hoppet jeg stadig mellom programmer for å lage et snitt, kontrollere en modell eller finne fram langs linjeføringen. Vispecta samler verktøyene jeg manglet, på ett sted – i nettleseren, uten å installere noe.»',
      'story.role': 'Jernbaneingeniør og opphavsperson til Vispecta',
      'feat.title': 'Laget for måten infrastruktur leses på',
      'feat.lead': 'Linjeføringer, profilnummer og tverrprofiler er jernbanens og vegens språk. Vispecta snakker det.',
      'f1.tag': 'Linjeføring og profilnummerering',
      'f1.title': 'Snitt i et hvilket som helst profilnummer',
      'f1.text': 'Vispecta leser IFC 4.3-linjeføringer med profilnummereringen. Skriv inn et profilnummer og få et tverrprofil akkurat der, med klassiske snittmerker A–A i modellen – eller kjør langs sporet. Ingen linjeføring i filen? Tegn en linje og bruk den på samme måte.',
      'f1.l1': 'IfcAlignment med profilnummer og kilometerstolper',
      'f1.l2': 'Skraverte snittflater i modellens farger',
      'f1.l3': 'Bla mellom profilnummer med piltastene',
      'f2.tag': 'Snittvindu',
      'f2.title': 'Se planen og snittet side om side',
      'f2.text': 'Snittvinduet viser det levende 2D-snittet mens du beveger deg gjennom modellen. Legg det på en ekstra skjerm, les av sideavstander og høyder i knekkpunktene, og la nøkkelplanen vise hvor du er.',
      'f2.l1': 'Sideavstand / høyde i hvert knekkpunkt',
      'f2.l2': 'Nøkkelplan med snittlinje og synsretning',
      'f2.l3': 'Kan åpnes i et eget vindu',
      'f3.tag': 'Tegninger',
      'f3.title': 'Fra modell til tegning med ett klikk',
      'f3.text': 'Eksporter snitt som PDF, SVG eller DXF – i målestokk, med tittelfelt, visningen bak snittet og et bånd med sideavstander, høyder og helninger. Lag en hel serie tverrprofiler i én PDF.',
      'f3.l1': 'PDF, SVG og DXF med lag',
      'f3.l2': 'Annoteringsbånd: sideavstand, høyde, helning',
      'f3.l3': 'Én side per profilnummer i en serie',
      'f4.tag': 'Lengdeprofiler',
      'f4.title': 'Brett ut modellen langs linjen',
      'f4.text': 'Et lengdeprofil langs en linjeføring eller en linje du selv tegner fra A til B: alt linjen passerer, brettet ut med profilnummer og høyder – og klart til eksport.',
      'f5.tag': 'Mange modeller, én visning',
      'f5.title': 'Samle fagene',
      'f5.text': 'Last inn sporet, vegen, brua og bygningen på én gang – plassert etter koordinatene sine. Grupper dem, gi dem navn du kjenner igjen, slå hele grupper av og på, slå dem sammen til én fil eller sammenlign to versjoner.',
      'f6.tag': 'Modellkontroll',
      'f6.title': 'Kontroller informasjonen, ikke bare geometrien',
      'f6.text': 'Kjør IDS-kontroller (buildingSMART Information Delivery Specification) med ifctester fra IfcOpenShell, se hva som består og feiler i modellen, og skriv saker som BCF. Eksempler på IDS-filer følger med.',
      'f7.tag': 'Terreng og grunnarbeider',
      'f7.title': 'Fra innmåling til skjæring og fylling',
      'f7.text': 'Bygg et terreng fra en punktsky – med et bakkefilter som fjerner trær og bygninger – eller åpne en høydemodell (GeoTIFF, f.eks. danske DHM) eller en LandXML-flate. Fargelegg den etter høyde, tegn høydekurver og sammenlign med fyllingen: skjæring og fylling per profilnummerintervall, som tabell, CSV og kart i 3D.',
      'f7.l1': 'Terreng (TIN) fra punktskyer, GeoTIFF og LandXML',
      'f7.l2': 'Høydekurver i 3D og i plantegninger',
      'f7.l3': 'Skjæring og fylling langs en linjeføring – og eksport som LandXML',
      'f8.tag': 'Punktskyer og koordinater',
      'f8.title': 'Innmålinger og modeller i ett koordinatsystem',
      'f8.text': 'Åpne laserskanninger og innmålinger ved siden av modellene: LAS, LAZ, E57 – og skyoptimaliserte COPC-filer med milliarder av punkter, der bare det du ser på, lastes inn. Punktene vises i hvert snitt. Modeller, punktskyer og terreng i forskjellige koordinatsystemer (UTM 32/33, DKTM, Kp2000, Gauss-Krüger, DB_REF eller en hvilken som helst EPSG-kode) regnes om til prosjektets system fortløpende.',
      'f8.l1': 'COPC-strømming, E57 med flere oppstillinger',
      'f8.l2': 'Punkter i snitt, profiler og tegninger',
      'f8.l3': 'Fortløpende omregning mellom koordinatsystemer',
      'g1.t': 'Mål',
      'g1.d': 'Avstander, høyder og koordinater med festing – også i kartkoordinater.',
      'g2.t': 'Mengder',
      'g2.d': 'Antall, volum, areal og lengde per klasse, etasje eller en hvilken som helst egenskap – til CSV.',
      'g3.t': 'Sammenlign og slå sammen',
      'g3.d': 'Se hva som er lagt til, fjernet eller endret mellom to versjoner. Slå sammen modeller til én IFC.',
      'g4.t': 'Python innebygd',
      'g4.d': 'Skript modellen med IfcOpenShell, rett i nettleseren.',
      'g5.t': 'Rediger metadata',
      'g5.d': 'Rett navn og egenskaper, og last ned den rettede IFC-filen.',
      'g6.t': 'Fargeblindvennlig',
      'g6.d': 'En fargestil basert på Okabe–Ito-paletten, pluss dempet, lys og kraftig stil.',
      'g7.t': 'Virker frakoblet',
      'g7.d': 'Installer den som app. Etter første besøk starter den uten forbindelse.',
      'g8.t': 'Ni språk',
      'g8.d': 'Engelsk, dansk, tysk, svensk, norsk, nederlandsk, fransk, spansk og hindi.',
      'priv.eyebrow': 'Innebygd personvern',
      'priv.title': 'Modellene dine blir på datamaskinen din.',
      'priv.text': 'Vispecta har ingen server som ser filene dine. Alt – å lese IFC, lage snitt, kontrollere IDS og kjøre Python – skjer i nettleseren din med WebAssembly.',
      'priv.l1t': 'Ingen opplasting',
      'priv.l1': 'IFC-, BCF- og IDS-filer behandles lokalt.',
      'priv.l2t': 'Ingen sporing',
      'priv.l2': 'Ingen informasjonskapsler, ingen statistikk, ingen kontoer.',
      'priv.l3t': 'Lagret i nettleseren din',
      'priv.l3': 'Prosjekter og innstillinger blir bare i denne nettleseren.',
      'priv.l4t': 'Selvforsynt',
      'priv.l4': 'Appen, skriftene og Python-miljøet hentes alle fra vispecta.com selv.',
      'faq.title': 'Spørsmål',
      'q1': 'Er det gratis?',
      'a1': 'Ja. Vispecta er gratis å bruke – også på jobb og i kommersielle prosjekter.',
      'q2': 'Hva betyr åpen kildekode under AGPL-3.0 for meg?',
      'a2': 'Du kan bruke Vispecta fritt og se all koden. Hvis noen endrer den og deler den – eller kjører en endret versjon som tjeneste – må de publisere endringene under samme lisens. Så ingen kan ta den, lukke den og selge den som sin egen.',
      'q3': 'Blir filene mine lastet opp noe sted?',
      'a3': 'Nei. Filene leses og behandles i nettleseren din. Ingenting om modellene dine sendes til vispecta.com eller andre.',
      'q4': 'Hvilke IFC-versjoner virker?',
      'a4': 'IFC 2x3, IFC 4 og IFC 4.3 (inkludert IfcAlignment). Store modeller på flere hundre MB virker i en nettleser på en datamaskin med nok minne.',
      'q5': 'Hva betyr «beta»?',
      'a5': 'Vispecta er nytt og i vekst. Ikke alle funksjoner er testet på alle slags modeller, så regn med en og annen feil – og meld den gjerne.',
      'q6': 'Hvilken nettleser trenger jeg?',
      'a6': 'En oppdatert Chrome, Edge, Firefox eller Safari på en datamaskin. Telefoner og nettbrett kan vise modeller, men verktøyene er laget for en større skjerm.',
      'con.title': 'Vær med og form Vispecta',
      'con.text': 'Ideer fra virkelige prosjekter gir de beste funksjonene. Fortell hva du savner, meld en feil eller bidra med kode.',
      'con.idea': 'Del en idé eller en feil',
      'con.code': 'Bidra med kode',
      'foot.credit': 'Skjermbildene viser en øvingsmodell av en dobbeltsporet jernbane og IFC 4.3-eksempelscenen fra buildingSMART International (CC BY 4.0).',
      _title: 'Om Vispecta – en gratis IFC-viser for jernbane- og vegprosjekter',
    },
    nl: {
      'nav.features': 'Functies',
      'nav.privacy': 'Privacy',
      'nav.faq': 'Vragen',
      'nav.lang': 'Taal',
      'cta.open': 'Vispecta openen',
      'cta.github': 'Broncode op GitHub',
      'hero.eyebrow': 'IFC-viewer voor infrastructuur',
      'hero3d.alt': 'Het voorbeeld van de dubbelsporige spoorlijn in 3D, doorsneden door een dwarsdoorsnede op de brug bij 12+205: het gearceerde brugdek met beide sporen, de leuningen en de beek eronder',
      'hero.title': 'Doorsneden, metrering en profielen – direct uit je IFC-modellen.',
      'hero.lead': 'Vispecta opent IFC-modellen in je browser en maakt er dwarsdoorsneden, lengteprofielen en tekeningen van – gemaakt voor spoor- en wegprojecten. Gratis, open source, en je bestanden verlaten nooit je computer.',
      'fact.free': 'Gratis',
      'fact.oss': 'Open source · AGPL-3.0',
      'fact.local': 'Draait lokaal',
      'story.quote': '“Als ingenieur in spoorprojecten sprong ik steeds tussen programma\'s om een doorsnede te maken, een model te controleren of mijn weg langs het alignement te vinden. Vispecta brengt de tools die ik miste samen op één plek – in de browser, zonder iets te installeren.”',
      'story.role': 'Spooringenieur en maker van Vispecta',
      'feat.title': 'Gemaakt voor de manier waarop infrastructuur wordt gelezen',
      'feat.lead': 'Alignementen, metrering en dwarsdoorsneden zijn de taal van spoor en weg. Vispecta spreekt die taal.',
      'f1.tag': 'Alignementen & metrering',
      'f1.title': 'Doorsnijden op elke metrering',
      'f1.text': 'Vispecta leest IFC 4.3-alignementen met hun metrering. Typ een metrering en krijg precies daar een dwarsdoorsnede, met klassieke doorsnedemarkeringen A–A in het model – of rijd langs het spoor. Geen alignement in het bestand? Teken een lijn en gebruik die op dezelfde manier.',
      'f1.l1': 'IfcAlignment met metreringslabels en kilometerpalen',
      'f1.l2': 'Gearceerde snijvlakken in de kleuren van het model',
      'f1.l3': 'Met de pijltoetsen door de metrering stappen',
      'f2.tag': 'Doorsnedevenster',
      'f2.title': 'Plattegrond en doorsnede naast elkaar',
      'f2.text': 'Het doorsnedevenster toont de live 2D-snede terwijl je door het model beweegt. Zet het op een tweede scherm, lees afstanden en hoogten af in de knikpunten, en laat het sleutelplan zien waar je bent.',
      'f2.l1': 'Afstand / hoogte in elk knikpunt',
      'f2.l2': 'Sleutelplan met snijlijn en kijkrichting',
      'f2.l3': 'Kan in een eigen venster worden geopend',
      'f3.tag': 'Tekeningen',
      'f3.title': 'Van model naar tekening met één klik',
      'f3.text': 'Exporteer doorsneden als PDF, SVG of DXF – op schaal, met titelblok, het aanzicht achter de snede en een strook met afstanden, hoogten en hellingen. Maak een hele serie dwarsdoorsneden in één PDF.',
      'f3.l1': 'PDF, SVG en DXF met lagen',
      'f3.l2': 'Annotatiestrook: afstand, hoogte, helling',
      'f3.l3': 'Eén pagina per metrering in een serie',
      'f4.tag': 'Lengteprofielen',
      'f4.title': 'Vouw het model uit langs de lijn',
      'f4.text': 'Een lengteprofiel langs een alignement of een lijn die je zelf van A naar B tekent: alles wat de lijn passeert, uitgevouwen met metrering en hoogten – en klaar om te exporteren.',
      'f5.tag': 'Veel modellen, één weergave',
      'f5.title': 'Breng de disciplines samen',
      'f5.text': 'Laad het spoor, de weg, de brug en het gebouw tegelijk – geplaatst op hun coördinaten. Groepeer ze, geef ze herkenbare namen, zet hele groepen aan en uit, voeg ze samen tot één bestand of vergelijk twee versies.',
      'f6.tag': 'Modelcontrole',
      'f6.title': 'Controleer de informatie, niet alleen de geometrie',
      'f6.text': 'Voer IDS-controles uit (buildingSMART Information Delivery Specification) met ifctester van IfcOpenShell, zie wat er in het model voldoet en wat niet, en leg bevindingen vast als BCF. Voorbeeld-IDS-bestanden zijn inbegrepen.',
      'f7.tag': 'Terrein & grondwerk',
      'f7.title': 'Van inmeting tot ontgraven en ophogen',
      'f7.text': 'Maak een terrein uit een puntenwolk – met een maaiveldfilter dat bomen en gebouwen verwijdert – of open een hoogtemodel (GeoTIFF, bijv. het Deense DHM) of een LandXML-oppervlak. Kleur het op hoogte, teken hoogtelijnen en vergelijk het met het grondlichaam: ontgraving en ophoging per metreringsbereik, als tabel, CSV en kaart in 3D.',
      'f7.l1': 'Terrein (TIN) uit puntenwolken, GeoTIFF en LandXML',
      'f7.l2': 'Hoogtelijnen in 3D en in plattegronden',
      'f7.l3': 'Ontgraven en ophogen langs een alignement – ook als LandXML-export',
      'f8.tag': 'Puntenwolken & coördinaten',
      'f8.title': 'Inmetingen en modellen in één coördinatenstelsel',
      'f8.text': 'Open laserscans en inmetingen naast de modellen: LAS, LAZ, E57 – en cloud-geoptimaliseerde COPC-bestanden met miljarden punten, waarvan alleen wordt geladen waar je naar kijkt. De punten verschijnen in elke doorsnede. Modellen, puntenwolken en terrein in verschillende coördinatenstelsels (UTM 32/33, DKTM, Kp2000, Gauss-Krüger, DB_REF of elke EPSG-code) worden direct omgerekend naar het stelsel van het project.',
      'f8.l1': 'COPC-streaming, E57 met meerdere scanposities',
      'f8.l2': 'Punten in doorsneden, profielen en tekeningen',
      'f8.l3': 'Directe omrekening tussen coördinatenstelsels',
      'g1.t': 'Meten',
      'g1.d': 'Afstanden, hoogten en coördinaten met snappen – ook in kaartcoördinaten.',
      'g2.t': 'Hoeveelheden',
      'g2.d': 'Aantal, volume, oppervlakte en lengte per klasse, verdieping of elke eigenschap – naar CSV.',
      'g3.t': 'Vergelijken & samenvoegen',
      'g3.d': 'Zie wat er tussen twee versies is toegevoegd, verwijderd of gewijzigd. Voeg modellen samen tot één IFC.',
      'g4.t': 'Python ingebouwd',
      'g4.d': 'Script het model met IfcOpenShell, direct in de browser.',
      'g5.t': 'Metadata bewerken',
      'g5.d': 'Corrigeer namen en eigenschappen en download de gecorrigeerde IFC.',
      'g6.t': 'Kleurenblindvriendelijk',
      'g6.d': 'Een kleurstijl op basis van het Okabe–Ito-palet, plus gedempte, lichte en felle stijlen.',
      'g7.t': 'Werkt offline',
      'g7.d': 'Installeer het als app. Na het eerste bezoek start het zonder verbinding.',
      'g8.t': 'Negen talen',
      'g8.d': 'Engels, Deens, Duits, Zweeds, Noors, Nederlands, Frans, Spaans en Hindi.',
      'priv.eyebrow': 'Privacy ingebouwd',
      'priv.title': 'Je modellen blijven op je computer.',
      'priv.text': 'Vispecta heeft geen server die je bestanden ziet. Alles – de IFC lezen, doorsneden maken, IDS controleren, Python uitvoeren – gebeurt in je browser met WebAssembly.',
      'priv.l1t': 'Geen upload',
      'priv.l1': 'IFC-, BCF- en IDS-bestanden worden lokaal verwerkt.',
      'priv.l2t': 'Geen tracking',
      'priv.l2': 'Geen cookies, geen statistieken, geen accounts.',
      'priv.l3t': 'Opgeslagen in je browser',
      'priv.l3': 'Projecten en instellingen blijven alleen in deze browser.',
      'priv.l4t': 'Zelfvoorzienend',
      'priv.l4': 'De app, de lettertypen en de Python-omgeving komen allemaal van vispecta.com zelf.',
      'faq.title': 'Vragen',
      'q1': 'Is het gratis?',
      'a1': 'Ja. Vispecta is gratis te gebruiken – ook op het werk en in commerciële projecten.',
      'q2': 'Wat betekent open source onder AGPL-3.0 voor mij?',
      'a2': 'Je kunt Vispecta vrij gebruiken en alle code bekijken. Als iemand het wijzigt en deelt – of een gewijzigde versie als dienst aanbiedt – moet die de wijzigingen onder dezelfde licentie publiceren. Zo kan niemand het overnemen, afsluiten en als eigen product verkopen.',
      'q3': 'Worden mijn bestanden ergens geüpload?',
      'a3': 'Nee. De bestanden worden in je browser gelezen en verwerkt. Niets over je modellen wordt naar vispecta.com of iemand anders gestuurd.',
      'q4': 'Welke IFC-versies werken?',
      'a4': 'IFC 2x3, IFC 4 en IFC 4.3 (inclusief IfcAlignment). Grote modellen van enkele honderden MB werken in een browser op een computer met genoeg geheugen.',
      'q5': 'Wat betekent ‘bèta’?',
      'a5': 'Vispecta is nieuw en groeit. Niet elke functie is op elk soort model getest, dus reken op een enkele fout – en meld die graag.',
      'q6': 'Welke browser heb ik nodig?',
      'a6': 'Een actuele Chrome, Edge, Firefox of Safari op een computer. Telefoons en tablets kunnen modellen tonen, maar de tools zijn gemaakt voor een groter scherm.',
      'con.title': 'Help Vispecta vorm te geven',
      'con.text': 'Ideeën uit echte projecten leveren de beste functies op. Vertel wat je mist, meld een fout of draag code bij.',
      'con.idea': 'Deel een idee of een fout',
      'con.code': 'Code bijdragen',
      'foot.credit': 'De schermafbeeldingen tonen een oefenmodel van een dubbelsporige spoorlijn en de IFC 4.3-voorbeeldscène van buildingSMART International (CC BY 4.0).',
      _title: 'Over Vispecta – een gratis IFC-viewer voor spoor- en wegprojecten',
    },
    fr: {
      'nav.features': 'Fonctions',
      'nav.privacy': 'Confidentialité',
      'nav.faq': 'Questions',
      'nav.lang': 'Langue',
      'cta.open': 'Ouvrir Vispecta',
      'cta.github': 'Le code source sur GitHub',
      'hero.eyebrow': 'Visionneuse IFC pour les infrastructures',
      'hero3d.alt': 'L\'exemple de ligne à double voie en 3D, coupé par un profil en travers sur le pont au PK 12+205 : le tablier hachuré avec les deux voies, les garde-corps et le ruisseau en dessous',
      'hero.title': 'Coupes, PK et profils – directement depuis vos modèles IFC.',
      'hero.lead': 'Vispecta ouvre les modèles IFC dans votre navigateur et en tire des profils en travers, des profils en long et des dessins – conçu pour les projets ferroviaires et routiers. Gratuit, open source, et vos fichiers ne quittent jamais votre ordinateur.',
      'fact.free': 'Gratuit',
      'fact.oss': 'Open source · AGPL-3.0',
      'fact.local': 'Fonctionne en local',
      'story.quote': '« En tant qu\'ingénieur sur des projets ferroviaires, je passais sans cesse d\'un logiciel à l\'autre pour faire une coupe, vérifier une maquette ou me repérer le long de l\'axe. Vispecta réunit en un seul endroit les outils qui me manquaient – dans le navigateur, sans rien installer. »',
      'story.role': 'Ingénieur ferroviaire et auteur de Vispecta',
      'feat.title': 'Conçu pour la façon dont on lit les infrastructures',
      'feat.lead': 'Axes, PK et profils en travers sont la langue du ferroviaire et de la route. Vispecta la parle.',
      'f1.tag': 'Axes et points kilométriques',
      'f1.title': 'Couper à n\'importe quel PK',
      'f1.text': 'Vispecta lit les axes IFC 4.3 avec leurs points kilométriques. Saisissez un PK et obtenez un profil en travers exactement à cet endroit, avec les repères de coupe classiques A–A dans le modèle – ou parcourez la voie. Pas d\'axe dans le fichier ? Dessinez une ligne et utilisez-la de la même façon.',
      'f1.l1': 'IfcAlignment avec étiquettes de PK et bornes kilométriques',
      'f1.l2': 'Faces coupées hachurées aux couleurs du modèle',
      'f1.l3': 'Passer d\'un PK à l\'autre avec les flèches',
      'f2.tag': 'Fenêtre de coupe',
      'f2.title': 'Le plan et la coupe côte à côte',
      'f2.text': 'La fenêtre de coupe affiche la coupe 2D en direct pendant que vous vous déplacez dans le modèle. Placez-la sur un second écran, lisez déports et altitudes aux points de cassure, et laissez le plan de repérage montrer où vous êtes.',
      'f2.l1': 'Déport / altitude à chaque point de cassure',
      'f2.l2': 'Plan de repérage avec la ligne de coupe et le sens de vue',
      'f2.l3': 'Peut s\'ouvrir dans sa propre fenêtre',
      'f3.tag': 'Dessins',
      'f3.title': 'Du modèle au dessin en un clic',
      'f3.text': 'Exportez les coupes en PDF, SVG ou DXF – à l\'échelle, avec cartouche, la vue derrière la coupe et un bandeau de déports, d\'altitudes et de pentes. Créez toute une série de profils en travers dans un seul PDF.',
      'f3.l1': 'PDF, SVG et DXF avec calques',
      'f3.l2': 'Bandeau d\'annotation : déport, altitude, pente',
      'f3.l3': 'Une page par PK pour une série',
      'f4.tag': 'Profils en long',
      'f4.title': 'Déroulez le modèle le long de la ligne',
      'f4.text': 'Un profil en long le long d\'un axe ou d\'une ligne que vous dessinez de A à B : tout ce que la ligne traverse, déroulé avec PK et altitudes – et prêt à exporter.',
      'f5.tag': 'Plusieurs modèles, une vue',
      'f5.title': 'Réunissez les disciplines',
      'f5.text': 'Chargez la voie, la route, le pont et le bâtiment en une fois – placés selon leurs coordonnées. Regroupez-les, donnez-leur des noms parlants, activez ou désactivez des groupes entiers, fusionnez-les en un seul fichier ou comparez deux versions.',
      'f6.tag': 'Contrôle de maquette',
      'f6.title': 'Vérifiez l\'information, pas seulement la géométrie',
      'f6.text': 'Lancez des contrôles IDS (buildingSMART Information Delivery Specification) avec ifctester d\'IfcOpenShell, voyez ce qui est conforme ou non dans le modèle et rédigez des observations en BCF. Des exemples de fichiers IDS sont fournis.',
      'f7.tag': 'Terrain et terrassements',
      'f7.title': 'Du levé aux déblais et remblais',
      'f7.text': 'Construisez un terrain à partir d\'un nuage de points – avec un filtre de sol qui retire arbres et bâtiments – ou ouvrez un modèle numérique de terrain (GeoTIFF, p. ex. le DHM danois) ou une surface LandXML. Colorez-le selon l\'altitude, tracez des courbes de niveau et comparez-le au remblai : déblais et remblais par intervalle de PK, en tableau, en CSV et en carte 3D.',
      'f7.l1': 'Terrain (TIN) à partir de nuages de points, GeoTIFF et LandXML',
      'f7.l2': 'Courbes de niveau en 3D et dans les plans',
      'f7.l3': 'Déblais et remblais le long d\'un axe – avec export LandXML',
      'f8.tag': 'Nuages de points et coordonnées',
      'f8.title': 'Levés et modèles dans un même système de coordonnées',
      'f8.text': 'Ouvrez scans laser et levés à côté des modèles : LAS, LAZ, E57 – et fichiers COPC optimisés pour le cloud avec des milliards de points, dont seul ce que vous regardez est chargé. Les points apparaissent dans chaque coupe. Modèles, nuages et terrains dans différents systèmes de coordonnées (UTM 32/33, DKTM, Kp2000, Gauss-Krüger, DB_REF ou tout code EPSG) sont convertis à la volée dans le système du projet.',
      'f8.l1': 'Streaming COPC, E57 avec plusieurs stations',
      'f8.l2': 'Points dans les coupes, les profils et les dessins',
      'f8.l3': 'Conversion à la volée entre systèmes de coordonnées',
      'g1.t': 'Mesurer',
      'g1.d': 'Distances, altitudes et coordonnées avec accrochage – aussi en coordonnées cartographiques.',
      'g2.t': 'Quantités',
      'g2.d': 'Nombre, volume, surface et longueur par classe, étage ou toute propriété – vers CSV.',
      'g3.t': 'Comparer et fusionner',
      'g3.d': 'Voyez ce qui a été ajouté, supprimé ou modifié entre deux versions. Fusionnez des modèles en un seul IFC.',
      'g4.t': 'Python intégré',
      'g4.d': 'Scriptez le modèle avec IfcOpenShell, directement dans le navigateur.',
      'g5.t': 'Modifier les métadonnées',
      'g5.d': 'Corrigez noms et propriétés, et téléchargez l\'IFC corrigé.',
      'g6.t': 'Adapté au daltonisme',
      'g6.d': 'Un style de couleurs basé sur la palette Okabe–Ito, plus des styles atténué, clair et vif.',
      'g7.t': 'Fonctionne hors ligne',
      'g7.d': 'Installez-le comme une application. Après la première visite, il démarre sans connexion.',
      'g8.t': 'Neuf langues',
      'g8.d': 'Anglais, danois, allemand, suédois, norvégien, néerlandais, français, espagnol et hindi.',
      'priv.eyebrow': 'Confidentialité dès la conception',
      'priv.title': 'Vos modèles restent sur votre ordinateur.',
      'priv.text': 'Vispecta n\'a aucun serveur qui voit vos fichiers. Tout – lire l\'IFC, faire des coupes, contrôler l\'IDS, exécuter Python – se passe dans votre navigateur avec WebAssembly.',
      'priv.l1t': 'Aucun envoi',
      'priv.l1': 'Les fichiers IFC, BCF et IDS sont traités localement.',
      'priv.l2t': 'Aucun pistage',
      'priv.l2': 'Pas de cookies, pas de statistiques, pas de comptes.',
      'priv.l3t': 'Enregistré dans votre navigateur',
      'priv.l3': 'Les projets et les réglages restent uniquement dans ce navigateur.',
      'priv.l4t': 'Autonome',
      'priv.l4': 'L\'application, les polices et l\'environnement Python viennent tous de vispecta.com.',
      'faq.title': 'Questions',
      'q1': 'Est-ce gratuit ?',
      'a1': 'Oui. Vispecta est gratuit, y compris au travail et dans des projets commerciaux.',
      'q2': 'Que signifie pour moi l\'open source sous AGPL-3.0 ?',
      'a2': 'Vous pouvez utiliser Vispecta librement et consulter tout son code. Si quelqu\'un le modifie et le partage – ou exploite une version modifiée comme service –, il doit publier ses modifications sous la même licence. Ainsi, personne ne peut le prendre, le fermer et le vendre comme le sien.',
      'q3': 'Mes fichiers sont-ils envoyés quelque part ?',
      'a3': 'Non. Les fichiers sont lus et traités dans votre navigateur. Rien de vos modèles n\'est envoyé à vispecta.com ni à personne d\'autre.',
      'q4': 'Quelles versions d\'IFC fonctionnent ?',
      'a4': 'IFC 2x3, IFC 4 et IFC 4.3 (y compris IfcAlignment). Les gros modèles de plusieurs centaines de Mo fonctionnent dans un navigateur sur un ordinateur doté d\'assez de mémoire.',
      'q5': 'Que signifie « bêta » ?',
      'a5': 'Vispecta est récent et en pleine croissance. Toutes les fonctions n\'ont pas été testées sur tous les types de modèles : attendez-vous à quelques bogues – et merci de les signaler.',
      'q6': 'De quel navigateur ai-je besoin ?',
      'a6': 'Un Chrome, Edge, Firefox ou Safari récent sur un ordinateur. Les téléphones et tablettes peuvent afficher des modèles, mais les outils sont conçus pour un plus grand écran.',
      'con.title': 'Participez à Vispecta',
      'con.text': 'Les idées issues de vrais projets donnent les meilleures fonctions. Dites-nous ce qui vous manque, signalez un bogue ou contribuez au code.',
      'con.idea': 'Partager une idée ou un bogue',
      'con.code': 'Contribuer au code',
      'foot.credit': 'Les captures montrent un modèle d\'exercice de ligne ferroviaire à double voie et la scène d\'exemple IFC 4.3 de buildingSMART International (CC BY 4.0).',
      _title: 'À propos de Vispecta – une visionneuse IFC gratuite pour les projets ferroviaires et routiers',
    },
    es: {
      'nav.features': 'Funciones',
      'nav.privacy': 'Privacidad',
      'nav.faq': 'Preguntas',
      'nav.lang': 'Idioma',
      'cta.open': 'Abrir Vispecta',
      'cta.github': 'El código en GitHub',
      'hero.eyebrow': 'Visor IFC para infraestructuras',
      'hero3d.alt': 'El ejemplo de línea de vía doble en 3D, cortado por una sección transversal en el puente en el PK 12+205: el tablero rayado con ambas vías, las barandillas y el arroyo debajo',
      'hero.title': 'Secciones, PK y perfiles – directamente desde tus modelos IFC.',
      'hero.lead': 'Vispecta abre modelos IFC en tu navegador y los convierte en secciones transversales, perfiles longitudinales y planos – pensado para proyectos ferroviarios y de carreteras. Gratis, de código abierto, y tus archivos nunca salen de tu ordenador.',
      'fact.free': 'Gratis',
      'fact.oss': 'Código abierto · AGPL-3.0',
      'fact.local': 'Funciona en local',
      'story.quote': '“Como ingeniero en proyectos ferroviarios, saltaba constantemente entre programas para hacer una sección, revisar un modelo o situarme a lo largo del eje. Vispecta reúne en un solo lugar las herramientas que me faltaban – en el navegador, sin instalar nada.”',
      'story.role': 'Ingeniero ferroviario y autor de Vispecta',
      'feat.title': 'Hecho para la forma en que se lee la infraestructura',
      'feat.lead': 'Ejes, PK y secciones transversales son el idioma del ferrocarril y la carretera. Vispecta lo habla.',
      'f1.tag': 'Ejes y puntos kilométricos',
      'f1.title': 'Corta en cualquier PK',
      'f1.text': 'Vispecta lee ejes IFC 4.3 con sus puntos kilométricos. Escribe un PK y obtén una sección transversal justo ahí, con las clásicas marcas de sección A–A en el modelo – o recorre la vía. ¿No hay eje en el archivo? Dibuja una línea y úsala del mismo modo.',
      'f1.l1': 'IfcAlignment con etiquetas de PK e hitos kilométricos',
      'f1.l2': 'Caras cortadas rayadas en los colores del modelo',
      'f1.l3': 'Recorre los PK con las flechas del teclado',
      'f2.tag': 'Ventana de sección',
      'f2.title': 'La planta y la sección, una junto a otra',
      'f2.text': 'La ventana de sección muestra el corte 2D en directo mientras te mueves por el modelo. Ponla en una segunda pantalla, lee desplazamientos y cotas en los puntos de quiebre, y deja que el plano de situación muestre dónde estás.',
      'f2.l1': 'Desplazamiento / cota en cada punto de quiebre',
      'f2.l2': 'Plano de situación con la línea de corte y la dirección de vista',
      'f2.l3': 'Se puede abrir en su propia ventana',
      'f3.tag': 'Planos',
      'f3.title': 'Del modelo al plano con un clic',
      'f3.text': 'Exporta secciones como PDF, SVG o DXF – a escala, con cajetín, la vista detrás del corte y una banda con desplazamientos, cotas y pendientes. Crea una serie completa de secciones transversales en un PDF.',
      'f3.l1': 'PDF, SVG y DXF con capas',
      'f3.l2': 'Banda de anotación: desplazamiento, cota, pendiente',
      'f3.l3': 'Una página por PK en una serie',
      'f4.tag': 'Perfiles longitudinales',
      'f4.title': 'Desarrolla el modelo a lo largo de la línea',
      'f4.text': 'Un perfil longitudinal a lo largo de un eje o de una línea que dibujes de A a B: todo lo que atraviesa la línea, desarrollado con PK y cotas – y listo para exportar.',
      'f5.tag': 'Muchos modelos, una vista',
      'f5.title': 'Reúne las disciplinas',
      'f5.text': 'Carga la vía, la carretera, el puente y el edificio a la vez – situados según sus coordenadas. Agrúpalos, dales nombres reconocibles, activa y desactiva grupos enteros, combínalos en un solo archivo o compara dos versiones.',
      'f6.tag': 'Comprobación de modelos',
      'f6.title': 'Comprueba la información, no solo la geometría',
      'f6.text': 'Ejecuta comprobaciones IDS (buildingSMART Information Delivery Specification) con ifctester de IfcOpenShell, mira qué cumple y qué no en el modelo, y redacta incidencias en BCF. Incluye archivos IDS de ejemplo.',
      'f7.tag': 'Terreno y movimiento de tierras',
      'f7.title': 'Del levantamiento al desmonte y terraplén',
      'f7.text': 'Crea un terreno a partir de una nube de puntos – con un filtro de suelo que quita árboles y edificios – o abre un modelo de elevaciones (GeoTIFF, p. ej. el DHM danés) o una superficie LandXML. Coloréalo por cota, dibuja curvas de nivel y compáralo con el terraplén: desmonte y terraplén por tramo de PK, en tabla, CSV y mapa en 3D.',
      'f7.l1': 'Terreno (TIN) a partir de nubes de puntos, GeoTIFF y LandXML',
      'f7.l2': 'Curvas de nivel en 3D y en planos de planta',
      'f7.l3': 'Desmonte y terraplén a lo largo de un eje – también exportado como LandXML',
      'f8.tag': 'Nubes de puntos y coordenadas',
      'f8.title': 'Levantamientos y modelos en un mismo sistema de coordenadas',
      'f8.text': 'Abre escaneos láser y levantamientos junto a los modelos: LAS, LAZ, E57 – y archivos COPC optimizados para la nube con miles de millones de puntos, de los que solo se carga lo que miras. Los puntos aparecen en cada sección. Modelos, nubes y terrenos en distintos sistemas de coordenadas (UTM 32/33, DKTM, Kp2000, Gauss-Krüger, DB_REF o cualquier código EPSG) se convierten al vuelo al sistema del proyecto.',
      'f8.l1': 'Streaming COPC, E57 con varias estaciones de escaneo',
      'f8.l2': 'Puntos en secciones, perfiles y planos',
      'f8.l3': 'Conversión al vuelo entre sistemas de coordenadas',
      'g1.t': 'Medir',
      'g1.d': 'Distancias, cotas y coordenadas con forzado del cursor – también en coordenadas cartográficas.',
      'g2.t': 'Mediciones',
      'g2.d': 'Número, volumen, superficie y longitud por clase, planta o cualquier propiedad – a CSV.',
      'g3.t': 'Comparar y combinar',
      'g3.d': 'Mira qué se ha añadido, eliminado o cambiado entre dos versiones. Combina modelos en un solo IFC.',
      'g4.t': 'Python integrado',
      'g4.d': 'Programa el modelo con IfcOpenShell, directamente en el navegador.',
      'g5.t': 'Editar metadatos',
      'g5.d': 'Corrige nombres y propiedades y descarga el IFC corregido.',
      'g6.t': 'Apto para daltónicos',
      'g6.d': 'Un estilo de color basado en la paleta Okabe–Ito, además de estilos suave, claro e intenso.',
      'g7.t': 'Funciona sin conexión',
      'g7.d': 'Instálalo como aplicación. Tras la primera visita se inicia sin conexión.',
      'g8.t': 'Nueve idiomas',
      'g8.d': 'Inglés, danés, alemán, sueco, noruego, neerlandés, francés, español e hindi.',
      'priv.eyebrow': 'Privacidad desde el diseño',
      'priv.title': 'Tus modelos se quedan en tu ordenador.',
      'priv.text': 'Vispecta no tiene ningún servidor que vea tus archivos. Todo – leer el IFC, hacer secciones, comprobar IDS, ejecutar Python – ocurre en tu navegador con WebAssembly.',
      'priv.l1t': 'Sin subidas',
      'priv.l1': 'Los archivos IFC, BCF e IDS se procesan localmente.',
      'priv.l2t': 'Sin rastreo',
      'priv.l2': 'Sin cookies, sin estadísticas, sin cuentas.',
      'priv.l3t': 'Guardado en tu navegador',
      'priv.l3': 'Los proyectos y los ajustes se quedan solo en este navegador.',
      'priv.l4t': 'Autónomo',
      'priv.l4': 'La aplicación, las fuentes y el entorno de Python vienen todos del propio vispecta.com.',
      'faq.title': 'Preguntas',
      'q1': '¿Es gratis?',
      'a1': 'Sí. Vispecta es gratis, también en el trabajo y en proyectos comerciales.',
      'q2': '¿Qué significa para mí el código abierto bajo AGPL-3.0?',
      'a2': 'Puedes usar Vispecta libremente y ver todo su código. Si alguien lo modifica y lo comparte – o ofrece una versión modificada como servicio – debe publicar sus cambios bajo la misma licencia. Así nadie puede quedárselo, cerrarlo y venderlo como propio.',
      'q3': '¿Se suben mis archivos a algún sitio?',
      'a3': 'No. Los archivos se leen y procesan en tu navegador. No se envía nada de tus modelos a vispecta.com ni a nadie más.',
      'q4': '¿Qué versiones de IFC funcionan?',
      'a4': 'IFC 2x3, IFC 4 e IFC 4.3 (incluido IfcAlignment). Los modelos grandes de varios cientos de MB funcionan en un navegador de ordenador con memoria suficiente.',
      'q5': '¿Qué significa “beta”?',
      'a5': 'Vispecta es nuevo y está creciendo. No todas las funciones se han probado con todo tipo de modelos, así que puede haber algún error – infórmalo, por favor.',
      'q6': '¿Qué navegador necesito?',
      'a6': 'Un Chrome, Edge, Firefox o Safari actual en un ordenador. Los móviles y tabletas pueden mostrar modelos, pero las herramientas están pensadas para una pantalla más grande.',
      'con.title': 'Ayuda a dar forma a Vispecta',
      'con.text': 'Las ideas de proyectos reales dan las mejores funciones. Cuéntanos qué te falta, informa de un error o contribuye con código.',
      'con.idea': 'Comparte una idea o un error',
      'con.code': 'Contribuir con código',
      'foot.credit': 'Las capturas muestran un modelo de práctica de una línea ferroviaria de vía doble y la escena de ejemplo IFC 4.3 de buildingSMART International (CC BY 4.0).',
      _title: 'Acerca de Vispecta – un visor IFC gratuito para proyectos ferroviarios y de carreteras',
    },
  };

  const KEY = 'onlineifc.lang'; // shared with the app
  const els = [...document.querySelectorAll('[data-t]')];
  const en = new Map(els.map((e) => [e, e.textContent]));
  const alts = [...document.querySelectorAll('[data-t-alt]')];
  const enAlt = new Map(alts.map((e) => [e, e.alt]));
  const enTitle = document.title;

  function pick() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (saved === 'en' || T[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || 'en']) {
      const code = String(l).slice(0, 2).toLowerCase();
      if (code === 'en' || T[code]) return code;
      if (code === 'nn' || code === 'no') return 'nb'; // Norwegian and nynorsk readers get bokmål
    }
    return 'en';
  }

  function apply(lang) {
    const d = T[lang] || {};
    for (const e of els) e.textContent = d[e.dataset.t] ?? en.get(e);
    for (const e of alts) e.alt = d[e.dataset.tAlt] ?? enAlt.get(e);
    document.title = d._title || enTitle;
    document.documentElement.lang = lang;
    document.getElementById('lang').value = lang;
  }

  const sel = document.getElementById('lang');
  sel.addEventListener('change', () => {
    try { localStorage.setItem(KEY, sel.value); } catch { /* ignore */ }
    apply(sel.value);
  });
  apply(pick());

  if (LINKEDIN) for (const a of document.querySelectorAll('#linkedin, #linkedin-foot')) { a.href = LINKEDIN; a.hidden = false; a.rel = 'me noopener'; }

  // click a screenshot to see it large
  const zoom = document.getElementById('zoom');
  const zimg = zoom.querySelector('img');
  for (const f of document.querySelectorAll('.frame img')) {
    f.addEventListener('click', () => { zimg.src = f.currentSrc || f.src; zimg.alt = f.alt; zoom.showModal(); });
  }
  zoom.addEventListener('click', () => zoom.close());

  // short clips: play while on screen; with reduced motion, show the still and let the reader start it
  const clips = document.querySelectorAll('.frame video');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    for (const v of clips) v.controls = true;
  } else {
    const vo = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const v = en.target;
        if (en.isIntersecting) v.play().catch(() => { v.controls = true; });
        else v.pause();
      }
    }, { threshold: 0.35 });
    for (const v of clips) vo.observe(v);
  }

  // the logo unfolds: the line is drawn flat, folds down into the cross section, and the dot drops in.
  // Plays in the header on load (and again on hover) and on the big mark in the closing card when it
  // comes into view. The SVG in the HTML is the finished logo, so without JS or with reduced motion
  // nothing changes.
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const out = (k) => 1 - Math.pow(1 - k, 3);
  const back = (k, s) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
  const bounce = (k) => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  };
  const playing = new WeakMap();
  function unfold(svg, speed = 1, wait = null) {
    const line = svg.querySelector('.mark-line'), dot = svg.querySelector('.mark-dot'), ring = svg.querySelector('.mark-ring');
    if (!line || !dot || playing.get(svg)) return;
    playing.set(svg, true);
    const frame = (t) => {
      const d = inOut(span(t, 0, 0.8)), f = span(t, 0.65, 1.3), fx = inOut(f);
      const fy = 30 + 18 * (f ? back(f, 1.6) : 0);
      line.setAttribute('d', `M6 30H19L${24 + 4 * fx} ${fy.toFixed(2)}H${40 - 4 * fx}L45 30H58`);
      const len = line.getTotalLength();
      line.style.strokeDasharray = `${len} ${len}`;
      line.style.strokeDashoffset = (len * (1 - d)).toFixed(2);
      const p = span(t, 1.1, 1.7);
      dot.setAttribute('cy', (-40 + 54 * bounce(p)).toFixed(2));
      dot.style.opacity = Math.min(1, p * 4).toFixed(2);
      if (ring) {
        const r = span(t, 1.62, 2.4);
        ring.setAttribute('r', (6 + 16 * out(r)).toFixed(2));
        ring.style.opacity = r > 0 && r < 1 ? (0.9 * (1 - r)).toFixed(2) : 0;
      }
    };
    const end = ring ? 2.4 : 1.7;
    let t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const t = ((now - t0) / 1000) * speed;
      frame(Math.min(t, end));
      if (t < end) requestAnimationFrame(step);
      else { line.style.strokeDasharray = line.style.strokeDashoffset = ''; playing.set(svg, false); }
    };
    frame(0);
    if (wait) wait.then(() => requestAnimationFrame(step)); else requestAnimationFrame(step);
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const head = document.querySelector('.top .brand');
    const headMark = head?.querySelector('.mark');
    if (headMark) {
      unfold(headMark, 1.2);
      head.addEventListener('pointerenter', () => unfold(headMark, 1.4));
    }
    const conMark = document.querySelector('.con-mark');
    if (conMark && 'IntersectionObserver' in window) {
      // drawn empty until it comes into view, then it unfolds
      unfold(conMark, 1, new Promise((go) => {
        const mo = new IntersectionObserver((entries) => {
          if (entries.some((en) => en.isIntersecting)) { mo.disconnect(); setTimeout(go, 250); }
        }, { threshold: 0.6 });
        mo.observe(conMark);
      }));
    }
  }

  // the live 3D hero (hero.js, built from src/about-hero.js): loaded after the page, where it can run –
  // WebGL 2, gzip in the browser, no reduced motion, no data saver. The poster stays otherwise.
  const hero = document.getElementById('hero-3d');
  if (hero && !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData
    && 'DecompressionStream' in window && 'IntersectionObserver' in window && 'ResizeObserver' in window) {
    let gl = false;
    try { const c = document.createElement('canvas').getContext('webgl2'); gl = !!c; c?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { gl = false; }
    const start = () => import('./hero.js').then((m) => m.startHero(hero, { data: 'hero/rail.bin.gz' })).catch((e) => console.warn('3D hero:', e));
    if (gl) {
      if (document.readyState === 'complete') setTimeout(start, 150);
      else addEventListener('load', () => setTimeout(start, 150), { once: true });
    }
  }

  // reveal sections when they scroll into view
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    for (const el of document.querySelectorAll('.feature, .card, blockquote, .priv-list li, .contribute-in')) { el.classList.add('reveal'); io.observe(el); }
  }
})();
