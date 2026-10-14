'use strict';

/**
 * Questions générées à partir de tableaux de faits : chaque ligne donne une question,
 * les 3 mauvaises réponses sont tirées au hasard parmi les autres lignes du tableau.
 * Le calcul mental est recréé à chaque démarrage. Ajoutées à la banque de quizQuestions.
 */

// ─── Tableaux de faits ────────────────────────────────────────────

// [pays, capitale, continent ou null si à cheval sur deux continents]
const COUNTRIES = [
    ['la France', 'Paris', 'Europe'], ['l\'Allemagne', 'Berlin', 'Europe'], ['l\'Espagne', 'Madrid', 'Europe'],
    ['l\'Italie', 'Rome', 'Europe'], ['le Portugal', 'Lisbonne', 'Europe'], ['la Belgique', 'Bruxelles', 'Europe'],
    ['les Pays-Bas', 'Amsterdam', 'Europe'], ['la Suisse', 'Berne', 'Europe'], ['l\'Autriche', 'Vienne', 'Europe'],
    ['la Pologne', 'Varsovie', 'Europe'], ['la Tchéquie', 'Prague', 'Europe'], ['la Slovaquie', 'Bratislava', 'Europe'],
    ['la Hongrie', 'Budapest', 'Europe'], ['la Roumanie', 'Bucarest', 'Europe'], ['la Bulgarie', 'Sofia', 'Europe'],
    ['la Grèce', 'Athènes', 'Europe'], ['la Croatie', 'Zagreb', 'Europe'], ['la Serbie', 'Belgrade', 'Europe'],
    ['la Slovénie', 'Ljubljana', 'Europe'], ['la Bosnie-Herzégovine', 'Sarajevo', 'Europe'], ['l\'Albanie', 'Tirana', 'Europe'],
    ['la Macédoine du Nord', 'Skopje', 'Europe'], ['le Monténégro', 'Podgorica', 'Europe'], ['le Danemark', 'Copenhague', 'Europe'],
    ['la Suède', 'Stockholm', 'Europe'], ['la Norvège', 'Oslo', 'Europe'], ['la Finlande', 'Helsinki', 'Europe'],
    ['l\'Islande', 'Reykjavik', 'Europe'], ['l\'Irlande', 'Dublin', 'Europe'], ['le Royaume-Uni', 'Londres', 'Europe'],
    ['l\'Estonie', 'Tallinn', 'Europe'], ['la Lettonie', 'Riga', 'Europe'], ['la Lituanie', 'Vilnius', 'Europe'],
    ['l\'Ukraine', 'Kiev', 'Europe'], ['la Biélorussie', 'Minsk', 'Europe'], ['la Moldavie', 'Chisinau', 'Europe'],
    ['la Russie', 'Moscou', null], ['Malte', 'La Valette', 'Europe'], ['Chypre', 'Nicosie', null],
    ['l\'Andorre', 'Andorre-la-Vieille', 'Europe'], ['la Chine', 'Pékin', 'Asie'], ['le Japon', 'Tokyo', 'Asie'],
    ['la Corée du Sud', 'Séoul', 'Asie'], ['la Corée du Nord', 'Pyongyang', 'Asie'], ['l\'Inde', 'New Delhi', 'Asie'],
    ['le Pakistan', 'Islamabad', 'Asie'], ['le Bangladesh', 'Dacca', 'Asie'], ['le Népal', 'Katmandou', 'Asie'],
    ['la Thaïlande', 'Bangkok', 'Asie'], ['le Vietnam', 'Hanoï', 'Asie'], ['le Cambodge', 'Phnom Penh', 'Asie'],
    ['le Laos', 'Vientiane', 'Asie'], ['la Birmanie', 'Naypyidaw', 'Asie'], ['la Malaisie', 'Kuala Lumpur', 'Asie'],
    ['les Philippines', 'Manille', 'Asie'], ['la Mongolie', 'Oulan-Bator', 'Asie'], ['l\'Afghanistan', 'Kaboul', 'Asie'],
    ['l\'Iran', 'Téhéran', 'Asie'], ['l\'Irak', 'Bagdad', 'Asie'], ['la Syrie', 'Damas', 'Asie'],
    ['le Liban', 'Beyrouth', 'Asie'], ['la Jordanie', 'Amman', 'Asie'], ['l\'Arabie saoudite', 'Riyad', 'Asie'],
    ['les Émirats arabes unis', 'Abou Dabi', 'Asie'], ['le Qatar', 'Doha', 'Asie'], ['Oman', 'Mascate', 'Asie'],
    ['la Turquie', 'Ankara', null], ['le Kazakhstan', 'Astana', 'Asie'], ['l\'Ouzbékistan', 'Tachkent', 'Asie'],
    ['la Géorgie', 'Tbilissi', null], ['l\'Arménie', 'Erevan', null], ['l\'Azerbaïdjan', 'Bakou', null],
    ['le Maroc', 'Rabat', 'Afrique'], ['l\'Algérie', 'Alger', 'Afrique'], ['la Tunisie', 'Tunis', 'Afrique'],
    ['la Libye', 'Tripoli', 'Afrique'], ['l\'Égypte', 'Le Caire', 'Afrique'], ['le Sénégal', 'Dakar', 'Afrique'],
    ['le Mali', 'Bamako', 'Afrique'], ['le Niger', 'Niamey', 'Afrique'], ['le Burkina Faso', 'Ouagadougou', 'Afrique'],
    ['la Côte d\'Ivoire', 'Yamoussoukro', 'Afrique'], ['le Ghana', 'Accra', 'Afrique'], ['le Togo', 'Lomé', 'Afrique'],
    ['le Bénin', 'Porto-Novo', 'Afrique'], ['le Nigeria', 'Abuja', 'Afrique'], ['le Cameroun', 'Yaoundé', 'Afrique'],
    ['le Gabon', 'Libreville', 'Afrique'], ['le Congo', 'Brazzaville', 'Afrique'], ['la République démocratique du Congo', 'Kinshasa', 'Afrique'],
    ['le Tchad', 'N\'Djaména', 'Afrique'], ['le Soudan', 'Khartoum', 'Afrique'], ['l\'Éthiopie', 'Addis-Abeba', 'Afrique'],
    ['le Kenya', 'Nairobi', 'Afrique'], ['l\'Ouganda', 'Kampala', 'Afrique'], ['la Tanzanie', 'Dodoma', 'Afrique'],
    ['le Rwanda', 'Kigali', 'Afrique'], ['Madagascar', 'Antananarivo', 'Afrique'], ['l\'Angola', 'Luanda', 'Afrique'],
    ['la Zambie', 'Lusaka', 'Afrique'], ['le Zimbabwe', 'Harare', 'Afrique'], ['le Mozambique', 'Maputo', 'Afrique'],
    ['la Namibie', 'Windhoek', 'Afrique'], ['le Botswana', 'Gaborone', 'Afrique'], ['la Mauritanie', 'Nouakchott', 'Afrique'],
    ['la Guinée', 'Conakry', 'Afrique'], ['la Somalie', 'Mogadiscio', 'Afrique'], ['les États-Unis', 'Washington', 'Amérique du Nord'],
    ['le Canada', 'Ottawa', 'Amérique du Nord'], ['le Mexique', 'Mexico', 'Amérique du Nord'], ['Cuba', 'La Havane', 'Amérique du Nord'],
    ['Haïti', 'Port-au-Prince', 'Amérique du Nord'], ['la Jamaïque', 'Kingston', 'Amérique du Nord'], ['le Costa Rica', 'San José', 'Amérique du Nord'],
    ['le Nicaragua', 'Managua', 'Amérique du Nord'], ['le Honduras', 'Tegucigalpa', 'Amérique du Nord'], ['la République dominicaine', 'Saint-Domingue', 'Amérique du Nord'],
    ['la Colombie', 'Bogota', 'Amérique du Sud'], ['le Venezuela', 'Caracas', 'Amérique du Sud'], ['l\'Équateur', 'Quito', 'Amérique du Sud'],
    ['le Pérou', 'Lima', 'Amérique du Sud'], ['le Chili', 'Santiago', 'Amérique du Sud'], ['l\'Argentine', 'Buenos Aires', 'Amérique du Sud'],
    ['l\'Uruguay', 'Montevideo', 'Amérique du Sud'], ['le Paraguay', 'Asuncion', 'Amérique du Sud'], ['le Brésil', 'Brasília', 'Amérique du Sud'],
    ['l\'Australie', 'Canberra', 'Océanie'], ['la Nouvelle-Zélande', 'Wellington', 'Océanie'], ['les Fidji', 'Suva', 'Océanie'],
    ['la Papouasie-Nouvelle-Guinée', 'Port Moresby', 'Océanie'],
];

const CURRENCIES = [
    ['le Royaume-Uni', 'La livre sterling'], ['les États-Unis', 'Le dollar américain'], ['le Japon', 'Le yen'],
    ['la Chine', 'Le yuan'], ['l\'Inde', 'La roupie indienne'], ['la Russie', 'Le rouble'], ['la Suisse', 'Le franc suisse'],
    ['le Brésil', 'Le réal'], ['le Mexique', 'Le peso mexicain'], ['le Canada', 'Le dollar canadien'],
    ['l\'Australie', 'Le dollar australien'], ['la Corée du Sud', 'Le won'], ['la Turquie', 'La livre turque'],
    ['l\'Afrique du Sud', 'Le rand'], ['la Suède', 'La couronne suédoise'], ['la Norvège', 'La couronne norvégienne'],
    ['le Danemark', 'La couronne danoise'], ['la Pologne', 'Le złoty'], ['la Hongrie', 'Le forint'],
    ['la Tchéquie', 'La couronne tchèque'], ['le Maroc', 'Le dirham marocain'], ['l\'Algérie', 'Le dinar algérien'],
    ['la Tunisie', 'Le dinar tunisien'], ['l\'Égypte', 'La livre égyptienne'], ['la Thaïlande', 'Le baht'],
    ['le Vietnam', 'Le dong'], ['l\'Indonésie', 'La roupie indonésienne'], ['l\'Argentine', 'Le peso argentin'],
    ['l\'Arabie saoudite', 'Le riyal saoudien'], ['les Émirats arabes unis', 'Le dirham des Émirats'], ['le Nigeria', 'Le naira'],
    ['le Kenya', 'Le shilling kényan'], ['l\'Ukraine', 'La hryvnia'], ['la Roumanie', 'Le leu roumain'],
    ['le Sénégal', 'Le franc CFA'], ['l\'Allemagne', 'L\'euro'], ['les Philippines', 'Le peso philippin'],
    ['la Malaisie', 'Le ringgit'], ['l\'Islande', 'La couronne islandaise'],
];

const ELEMENTS = [
    ['l\'hydrogène', 'H'], ['l\'hélium', 'He'], ['le carbone', 'C'], ['l\'azote', 'N'], ['l\'oxygène', 'O'],
    ['le sodium', 'Na'], ['le magnésium', 'Mg'], ['l\'aluminium', 'Al'], ['le silicium', 'Si'], ['le phosphore', 'P'],
    ['le soufre', 'S'], ['le chlore', 'Cl'], ['le potassium', 'K'], ['le calcium', 'Ca'], ['le fer', 'Fe'],
    ['le cuivre', 'Cu'], ['le zinc', 'Zn'], ['l\'argent', 'Ag'], ['l\'or', 'Au'], ['le mercure', 'Hg'],
    ['le plomb', 'Pb'], ['l\'étain', 'Sn'], ['l\'uranium', 'U'], ['le néon', 'Ne'], ['l\'argon', 'Ar'],
    ['le nickel', 'Ni'], ['le cobalt', 'Co'], ['le platine', 'Pt'], ['l\'iode', 'I'], ['le fluor', 'F'],
    ['le lithium', 'Li'], ['le titane', 'Ti'], ['le chrome', 'Cr'], ['le manganèse', 'Mn'], ['le tungstène', 'W'],
    ['le radium', 'Ra'], ['le plutonium', 'Pu'], ['le bore', 'B'], ['le krypton', 'Kr'], ['le brome', 'Br'],
];

// [mot français, mot anglais]
const ENGLISH = [
    ['pomme', 'apple'], ['chien', 'dog'], ['chat', 'cat'], ['maison', 'house'], ['voiture', 'car'], ['livre', 'book'],
    ['eau', 'water'], ['pain', 'bread'], ['fromage', 'cheese'], ['ciel', 'sky'], ['soleil', 'sun'], ['lune', 'moon'],
    ['étoile', 'star'], ['arbre', 'tree'], ['fleur', 'flower'], ['mer', 'sea'], ['montagne', 'mountain'], ['rivière', 'river'],
    ['ville', 'city'], ['école', 'school'], ['enfant', 'child'], ['femme', 'woman'], ['homme', 'man'], ['ami', 'friend'],
    ['travail', 'work'], ['cheval', 'horse'], ['oiseau', 'bird'], ['poisson', 'fish'], ['vache', 'cow'], ['cochon', 'pig'],
    ['mouton', 'sheep'], ['lapin', 'rabbit'], ['souris', 'mouse'], ['rouge', 'red'], ['bleu', 'blue'], ['vert', 'green'],
    ['jaune', 'yellow'], ['noir', 'black'], ['blanc', 'white'], ['grand', 'big'], ['petit', 'small'], ['rapide', 'fast'],
    ['lent', 'slow'], ['chaud', 'hot'], ['froid', 'cold'], ['heureux', 'happy'], ['triste', 'sad'], ['fort', 'strong'],
    ['faible', 'weak'], ['cuisine', 'kitchen'], ['chambre', 'bedroom'], ['fenêtre', 'window'], ['porte', 'door'], ['chaise', 'chair'],
    ['lit', 'bed'], ['cuillère', 'spoon'], ['fourchette', 'fork'], ['couteau', 'knife'], ['assiette', 'plate'], ['tasse', 'cup'],
    ['chemise', 'shirt'], ['chaussure', 'shoe'], ['chapeau', 'hat'], ['manteau', 'coat'], ['jupe', 'skirt'], ['montre', 'watch'],
    ['clé', 'key'], ['lundi', 'Monday'], ['mardi', 'Tuesday'], ['mercredi', 'Wednesday'], ['jeudi', 'Thursday'], ['vendredi', 'Friday'],
    ['samedi', 'Saturday'], ['dimanche', 'Sunday'], ['janvier', 'January'], ['février', 'February'], ['août', 'August'], ['hiver', 'winter'],
    ['été', 'summer'], ['printemps', 'spring'], ['automne', 'autumn'], ['nuit', 'night'], ['matin', 'morning'], ['demain', 'tomorrow'],
    ['hier', 'yesterday'], ['aujourd\'hui', 'today'], ['toujours', 'always'], ['jamais', 'never'], ['acheter', 'to buy'], ['vendre', 'to sell'],
    ['manger', 'to eat'], ['boire', 'to drink'], ['dormir', 'to sleep'], ['courir', 'to run'], ['nager', 'to swim'], ['chanter', 'to sing'],
    ['écrire', 'to write'], ['lire', 'to read'], ['parler', 'to speak'], ['apprendre', 'to learn'], ['oublier', 'to forget'], ['trouver', 'to find'],
    ['perdre', 'to lose'], ['gagner', 'to win'], ['ouvrir', 'to open'], ['fermer', 'to close'], ['neige', 'snow'], ['pluie', 'rain'],
    ['vent', 'wind'], ['nuage', 'cloud'], ['orage', 'storm'], ['plage', 'beach'], ['île', 'island'], ['forêt', 'forest'],
    ['champ', 'field'], ['pont', 'bridge'], ['rue', 'street'], ['gare', 'station'], ['aéroport', 'airport'], ['hôpital', 'hospital'],
    ['boulangerie', 'bakery'], ['bibliothèque', 'library'], ['médecin', 'doctor'], ['boulanger', 'baker'], ['pompier', 'firefighter'], ['cuisinier', 'cook'],
    ['genou', 'knee'], ['épaule', 'shoulder'], ['cœur', 'heart'], ['dent', 'tooth'], ['cheveux', 'hair'], ['oreille', 'ear'],
];

// [œuvre, auteur]
const BOOKS = [
    ['Les Misérables', 'Victor Hugo'], ['Notre-Dame de Paris', 'Victor Hugo'], ['Germinal', 'Émile Zola'], ['L\'Assommoir', 'Émile Zola'],
    ['Madame Bovary', 'Gustave Flaubert'], ['Le Rouge et le Noir', 'Stendhal'], ['Le Père Goriot', 'Honoré de Balzac'], ['Les Fleurs du mal', 'Charles Baudelaire'],
    ['Candide', 'Voltaire'], ['Le Comte de Monte-Cristo', 'Alexandre Dumas'], ['Le Tour du monde en quatre-vingts jours', 'Jules Verne'], ['L\'Étranger', 'Albert Camus'],
    ['La Peste', 'Albert Camus'], ['Le Petit Prince', 'Antoine de Saint-Exupéry'], ['Bel-Ami', 'Guy de Maupassant'], ['Le Cid', 'Pierre Corneille'],
    ['Phèdre', 'Jean Racine'], ['Tartuffe', 'Molière'], ['Le Misanthrope', 'Molière'], ['Cyrano de Bergerac', 'Edmond Rostand'],
    ['Gargantua', 'François Rabelais'], ['Les Essais', 'Michel de Montaigne'], ['Hamlet', 'William Shakespeare'], ['Macbeth', 'William Shakespeare'],
    ['Don Quichotte', 'Miguel de Cervantes'], ['1984', 'George Orwell'], ['La Ferme des animaux', 'George Orwell'], ['Orgueil et Préjugés', 'Jane Austen'],
    ['Frankenstein', 'Mary Shelley'], ['Dracula', 'Bram Stoker'], ['Les Aventures de Tom Sawyer', 'Mark Twain'], ['Moby Dick', 'Herman Melville'],
    ['Guerre et Paix', 'Léon Tolstoï'], ['Crime et Châtiment', 'Fiodor Dostoïevski'], ['L\'Odyssée', 'Homère'], ['La Divine Comédie', 'Dante'],
    ['Le Hobbit', 'J. R. R. Tolkien'], ['Le Vieil Homme et la Mer', 'Ernest Hemingway'], ['Alice au pays des merveilles', 'Lewis Carroll'], ['Robinson Crusoé', 'Daniel Defoe'],
    ['Les Voyages de Gulliver', 'Jonathan Swift'], ['Les Liaisons dangereuses', 'Choderlos de Laclos'], ['À la recherche du temps perdu', 'Marcel Proust'], ['Le Grand Meaulnes', 'Alain-Fournier'],
    ['Charlie et la Chocolaterie', 'Roald Dahl'], ['Les Fables', 'Jean de La Fontaine'], ['Cendrillon (conte)', 'Charles Perrault'], ['Le Vicomte de Bragelonne', 'Alexandre Dumas'],
    ['Les Hauts de Hurlevent', 'Emily Brontë'], ['Jane Eyre', 'Charlotte Brontë'], ['Le Portrait de Dorian Gray', 'Oscar Wilde'], ['Ça', 'Stephen King'],
    ['Le Nom de la rose', 'Umberto Eco'], ['Cent ans de solitude', 'Gabriel García Márquez'], ['L\'Alchimiste', 'Paulo Coelho'], ['Bonjour tristesse', 'Françoise Sagan'],
];

// [événement, année] (années négatives = avant J.-C.)
const DATES = [
    ['la prise de la Bastille', 1789], ['l\'arrivée de Christophe Colomb en Amérique', 1492], ['la chute du mur de Berlin', 1989],
    ['les premiers pas de l\'homme sur la Lune', 1969], ['le début de la Première Guerre mondiale', 1914], ['l\'armistice de la Première Guerre mondiale', 1918],
    ['le début de la Seconde Guerre mondiale', 1939], ['la fin de la Seconde Guerre mondiale', 1945], ['le couronnement de Charlemagne comme empereur', 800],
    ['la bataille de Hastings', 1066], ['la bataille de Marignan', 1515], ['la chute de Constantinople', 1453],
    ['le sacre de Napoléon Ier', 1804], ['la bataille de Waterloo', 1815], ['le naufrage du Titanic', 1912],
    ['le krach boursier de Wall Street', 1929], ['les attentats du 11 septembre aux États-Unis', 2001], ['la Déclaration d\'indépendance des États-Unis', 1776],
    ['la révolution russe d\'Octobre', 1917], ['l\'abolition définitive de l\'esclavage en France', 1848], ['les événements de Mai 68', 1968],
    ['l\'arrivée des pièces et billets en euros', 2002], ['le premier vol motorisé des frères Wright', 1903], ['la découverte de la pénicilline', 1928],
    ['l\'exécution de Louis XVI', 1793], ['l\'édit de Nantes', 1598], ['le massacre de la Saint-Barthélemy', 1572],
    ['le débarquement de Normandie', 1944], ['l\'élection de Nelson Mandela', 1994], ['le premier homme dans l\'espace (Gagarine)', 1961],
    ['la chute de l\'Empire romain d\'Occident', 476], ['la réunification de l\'Allemagne', 1990], ['la dissolution de l\'URSS', 1991],
    ['la première Coupe du monde de football gagnée par la France', 1998], ['la loi de séparation des Églises et de l\'État', 1905], ['l\'inauguration de la tour Eiffel', 1889],
    ['la mort de Jeanne d\'Arc', 1431], ['la révocation de l\'édit de Nantes', 1685], ['la signature du traité de Versailles', 1919],
    ['le lancement du satellite Spoutnik', 1957], ['la crise des missiles de Cuba', 1962], ['l\'assassinat de John F. Kennedy', 1963],
    ['l\'ouverture du tunnel sous la Manche', 1994], ['le dépôt du brevet du téléphone par Graham Bell', 1876], ['la bataille d\'Austerlitz', 1805],
];

const ANIMAL_YOUNG = [
    ['du cheval', 'Le poulain'], ['de la vache', 'Le veau'], ['du mouton', 'L\'agneau'], ['de la chèvre', 'Le chevreau'],
    ['du cochon', 'Le porcelet'], ['du chien', 'Le chiot'], ['du chat', 'Le chaton'], ['du lapin', 'Le lapereau'],
    ['du lion', 'Le lionceau'], ['de l\'ours', 'L\'ourson'], ['du loup', 'Le louveteau'], ['du renard', 'Le renardeau'],
    ['du cerf', 'Le faon'], ['du canard', 'Le caneton'], ['de l\'oie', 'L\'oison'], ['de la poule', 'Le poussin'],
    ['de la grenouille', 'Le têtard'], ['de l\'éléphant', 'L\'éléphanteau'], ['de l\'aigle', 'L\'aiglon'], ['de la baleine', 'Le baleineau'],
    ['de la souris', 'Le souriceau'], ['de l\'âne', 'L\'ânon'], ['du sanglier', 'Le marcassin'], ['du cygne', 'Le cygneau'], ['de la dinde', 'Le dindonneau'],
];

const ANIMAL_CRIES = [
    ['du chien', 'Aboyer'], ['du chat', 'Miauler'], ['de la vache', 'Meugler'], ['du cheval', 'Hennir'],
    ['du lion', 'Rugir'], ['du loup', 'Hurler'], ['du mouton', 'Bêler'], ['de l\'âne', 'Braire'],
    ['du serpent', 'Siffler'], ['du cochon', 'Grogner'], ['de l\'éléphant', 'Barrir'], ['du corbeau', 'Croasser'],
    ['de la grenouille', 'Coasser'], ['du pigeon', 'Roucouler'], ['du cerf', 'Bramer'], ['de la poule', 'Caqueter'],
    ['du hibou', 'Hululer'], ['de l\'abeille', 'Bourdonner'],
];

// [invention ou découverte, personne]
const INVENTIONS = [
    ['le téléphone', 'Graham Bell'], ['l\'ampoule à incandescence (version commerciale)', 'Thomas Edison'], ['l\'imprimerie à caractères mobiles', 'Gutenberg'],
    ['le vaccin contre la rage', 'Louis Pasteur'], ['la dynamite', 'Alfred Nobel'], ['le cinématographe', 'Les frères Lumière'],
    ['le premier avion motorisé', 'Les frères Wright'], ['le paratonnerre', 'Benjamin Franklin'], ['la machine à vapeur améliorée', 'James Watt'],
    ['la pile électrique', 'Alessandro Volta'], ['l\'écriture pour aveugles', 'Louis Braille'], ['le stéthoscope', 'René Laennec'],
    ['le World Wide Web', 'Tim Berners-Lee'], ['la théorie de l\'évolution', 'Charles Darwin'], ['les rayons X', 'Wilhelm Röntgen'],
    ['le premier vaccin (variole)', 'Edward Jenner'], ['la radio (TSF)', 'Guglielmo Marconi'], ['la photographie', 'Nicéphore Niépce'],
    ['la montgolfière', 'Les frères Montgolfier'], ['le code Morse', 'Samuel Morse'], ['le moteur Diesel', 'Rudolf Diesel'],
    ['le tableau périodique des éléments', 'Dmitri Mendeleïev'], ['le système Linux', 'Linus Torvalds'], ['la radioactivité naturelle', 'Henri Becquerel'],
    ['la relativité', 'Albert Einstein'], ['la loi de la gravitation universelle', 'Isaac Newton'], ['l\'héliocentrisme moderne', 'Nicolas Copernic'],
];

// ─── Générateurs ──────────────────────────────────────────────────

function pickOthers(values, answer, count = 3) {
    const pool = [...new Set(values.filter(v => v !== answer))];
    const out = [];
    while (out.length < count && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
}

/** Une question par ligne : [question, bonne réponse, 3 mauvaises tirées du tableau]. */
function fromTable(rows, question, answer) {
    const answers = rows.map(answer);
    return rows.map(row => {
        const right = answer(row);
        const wrong = pickOthers(answers, right);
        return wrong.length === 3 ? [question(row), right, ...wrong] : null;
    }).filter(Boolean);
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const yearLabel = y => (y < 0 ? `${-y} av. J.-C.` : String(y));

function dateQuestions() {
    return DATES.map(([event, year]) => {
        const offsets = new Set();
        while (offsets.size < 3) {
            const delta = (Math.floor(Math.random() * 25) + 1) * (Math.random() < 0.5 ? -1 : 1);
            if (year + delta > 0) offsets.add(year + delta);
        }
        return [`En quelle année a eu lieu ${event} ?`, yearLabel(year), ...[...offsets].map(yearLabel)];
    });
}

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/** Calcul mental : réponses fausses proches de la bonne, pour qu'il faille vraiment calculer. */
function mathQuestions(count = 300) {
    const out = [];
    const make = (text, result) => {
        const wrong = new Set();
        while (wrong.size < 3) {
            const delta = rand(1, Math.max(3, Math.round(Math.abs(result) * 0.15))) * (Math.random() < 0.5 ? -1 : 1);
            if (result + delta !== result && result + delta >= 0) wrong.add(result + delta);
        }
        out.push([text, String(result), ...[...wrong].map(String)]);
    };
    while (out.length < count) {
        const kind = rand(0, 5);
        if (kind === 0) { const a = rand(12, 99), b = rand(12, 99); make(`Combien font ${a} + ${b} ?`, a + b); }
        else if (kind === 1) { const a = rand(50, 199), b = rand(11, 49); make(`Combien font ${a} − ${b} ?`, a - b); }
        else if (kind === 2) { const a = rand(3, 15), b = rand(3, 15); make(`Combien font ${a} × ${b} ?`, a * b); }
        else if (kind === 3) { const b = rand(2, 12), r = rand(2, 15); make(`Combien font ${b * r} ÷ ${b} ?`, r); }
        else if (kind === 4) { const a = rand(4, 25); make(`Combien font ${a} au carré ?`, a * a); }
        else { const p = [10, 20, 25, 50, 75][rand(0, 4)], n = rand(2, 20) * 20; make(`Combien font ${p} % de ${n} ?`, (p * n) / 100); }
    }
    return out;
}

// ─── Thèmes générés et ajouts aux thèmes existants ───────────────

const withContinent = COUNTRIES.filter(([, , continent]) => continent);

const GENERATED_THEMES = {
    pays: {
        label: 'Pays du monde',
        questions: [
            ...fromTable(withContinent, ([country]) => `Sur quel continent se trouve ${country} ?`, ([, , continent]) => continent),
            ...fromTable(CURRENCIES, ([country]) => `Quelle est la monnaie de ${country} ?`, ([, money]) => money),
            ...fromTable(COUNTRIES, ([, capital]) => `${capitalize(capital)} est la capitale de quel pays ?`, ([country]) => capitalize(country)),
        ],
    },
    chimie: {
        label: 'Chimie & éléments',
        questions: [
            ...fromTable(ELEMENTS, ([name]) => `Quel est le symbole chimique de ${name} ?`, ([, symbol]) => symbol),
            ...fromTable(ELEMENTS, ([, symbol]) => `Quel élément a pour symbole « ${symbol} » ?`, ([name]) => capitalize(name)),
        ],
    },
    anglais: {
        label: 'Anglais',
        questions: [
            ...fromTable(ENGLISH, ([fr]) => `Comment dit-on « ${fr} » en anglais ?`, ([, en]) => en),
            ...fromTable(ENGLISH, ([, en]) => `Que veut dire « ${en} » en français ?`, ([fr]) => fr),
        ],
    },
    livres: {
        label: 'Livres & auteurs',
        questions: fromTable(BOOKS, ([book]) => `Qui a écrit « ${book} » ?`, ([, author]) => author),
    },
    dates: {
        label: 'Dates historiques',
        questions: dateQuestions(),
    },
    inventions: {
        label: 'Inventions & découvertes',
        questions: fromTable(INVENTIONS, ([thing]) => `À qui doit-on ${thing} ?`, ([, who]) => who),
    },
    calcul: {
        label: 'Calcul mental',
        questions: mathQuestions(),
    },
};

// Ajouts aux thèmes écrits à la main (même thème, plus de questions).
const EXTRA = {
    capitales: fromTable(COUNTRIES, ([country]) => `Quelle est la capitale de ${country} ?`, ([, capital]) => capital),
    animaux: [
        ...fromTable(ANIMAL_YOUNG, ([animal]) => `Comment s'appelle le petit ${animal} ?`, ([, young]) => young),
        ...fromTable(ANIMAL_CRIES, ([animal]) => `Quel verbe désigne le cri ${animal} ?`, ([, cry]) => cry),
    ],
};

module.exports = { GENERATED_THEMES, EXTRA };
