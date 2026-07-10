// Données coraniques : 5 sourates courtes, 25 versets.
// ⚠️ Texte à valider par un érudit islamique avant diffusion.

export const SURAHS = [
  { id: "fatiha", num: 1, name: "Al-Fâtiha", meaning: "L'Ouverture", verseCount: 7 },
  { id: "ikhlas", num: 112, name: "Al-Ikhlâs", meaning: "La Sincérité", verseCount: 4 },
  { id: "falaq", num: 113, name: "Al-Falaq", meaning: "L'Aube naissante", verseCount: 5 },
  { id: "nas", num: 114, name: "An-Nâs", meaning: "Les Hommes", verseCount: 6 },
  { id: "nasr", num: 110, name: "An-Nasr", meaning: "Le Secours", verseCount: 3 },
];

export const VERSES = [
  // Sourate 1 : Al-Fatiha (7 versets)
  { id: "fatiha:1", surahId: "fatiha", verseNum: 1, arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", translit: "Bismillah ar-Rahman ar-Rahim", meaning: "Au nom d'Allah, le Tout-Miséricordieux, le Très Miséricordieux" },
  { id: "fatiha:2", surahId: "fatiha", verseNum: 2, arabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", translit: "Al-hamdu lillahi rabbi al-alamin", meaning: "La louange est à Allah, Seigneur de l'univers" },
  { id: "fatiha:3", surahId: "fatiha", verseNum: 3, arabic: "الرَّحْمَٰنِ الرَّحِيمِ", translit: "Ar-Rahman ar-Rahim", meaning: "Le Tout-Miséricordieux, le Très Miséricordieux" },
  { id: "fatiha:4", surahId: "fatiha", verseNum: 4, arabic: "مَالِكِ يَوْمِ الدِّينِ", translit: "Maliki yawm ad-Din", meaning: "Maître du Jour du jugement" },
  { id: "fatiha:5", surahId: "fatiha", verseNum: 5, arabic: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", translit: "Iyyaka na'budu wa-iyyaka nasta'in", meaning: "C'est Toi que nous adorons et c'est Toi dont nous implorons l'aide" },
  { id: "fatiha:6", surahId: "fatiha", verseNum: 6, arabic: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", translit: "Ihdi-na as-sirat al-mustaqim", meaning: "Guide-nous sur le droit chemin" },
  { id: "fatiha:7", surahId: "fatiha", verseNum: 7, arabic: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ", translit: "Sirat al-ladhina an'amta alayhim ghayri al-maghdub alayhim wa-la ad-dallin", meaning: "Le chemin de ceux sur lesquels Tu as versé Ta grâce, non celui de ceux qui se sont attiré Ta colère, ni celui de ceux qui s'égarent" },

  // Sourate 112 : Al-Ikhlas (4 versets)
  { id: "ikhlas:1", surahId: "ikhlas", verseNum: 1, arabic: "قُلْ هُوَ اللَّهُ أَحَدٌ", translit: "Qul huwa Allahu ahad", meaning: "Dis : « Allah est Unique »" },
  { id: "ikhlas:2", surahId: "ikhlas", verseNum: 2, arabic: "اللَّهُ الصَّمَدُ", translit: "Allahu as-Samad", meaning: "Allah est le Seigneur absolu, auquel on s'adresse pour tous les besoins" },
  { id: "ikhlas:3", surahId: "ikhlas", verseNum: 3, arabic: "لَمْ يَلِدْ وَلَمْ يُولَدْ", translit: "Lam yalid wa-lam yulad", meaning: "Il n'a point engendré et n'a pas été engendré" },
  { id: "ikhlas:4", surahId: "ikhlas", verseNum: 4, arabic: "وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ", translit: "Wa-lam yakun lahu kufuwan ahad", meaning: "Et nul n'est semblable à Lui" },

  // Sourate 113 : Al-Falaq (5 versets)
  { id: "falaq:1", surahId: "falaq", verseNum: 1, arabic: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ", translit: "Qul a'udhu bi-rabbi al-falaq", meaning: "Dis : « Je me réfugie auprès du Seigneur de l'aube »" },
  { id: "falaq:2", surahId: "falaq", verseNum: 2, arabic: "مِنْ شَرِّ مَا خَلَقَ", translit: "Min sharr ma khalaqa", meaning: "contre le mal de ce qu'Il a créé" },
  { id: "falaq:3", surahId: "falaq", verseNum: 3, arabic: "وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ", translit: "Wa-min sharr ghasi'in idha waqaba", meaning: "et contre le mal de la nuit quand elle s'étend" },
  { id: "falaq:4", surahId: "falaq", verseNum: 4, arabic: "وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ", translit: "Wa-min sharr an-naffathat fi al-'uqad", meaning: "et contre le mal de celles qui soufflent sur les nœuds" },
  { id: "falaq:5", surahId: "falaq", verseNum: 5, arabic: "وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ", translit: "Wa-min sharr hasid idha hasad", meaning: "et contre le mal de l'envieux quand il envie" },

  // Sourate 114 : An-Nas (6 versets)
  { id: "nas:1", surahId: "nas", verseNum: 1, arabic: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ", translit: "Qul a'udhu bi-rabbi an-nas", meaning: "Dis : « Je me réfugie auprès du Seigneur des hommes »" },
  { id: "nas:2", surahId: "nas", verseNum: 2, arabic: "مَلِكِ النَّاسِ", translit: "Maliki an-nas", meaning: "Roi des hommes" },
  { id: "nas:3", surahId: "nas", verseNum: 3, arabic: "إِلَٰهِ النَّاسِ", translit: "Ilahi an-nas", meaning: "Dieu des hommes" },
  { id: "nas:4", surahId: "nas", verseNum: 4, arabic: "مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ", translit: "Min sharr al-waswas al-khannass", meaning: "contre le mal du mauvais conseiller qui se cache" },
  { id: "nas:5", surahId: "nas", verseNum: 5, arabic: "الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ", translit: "Alladhi yuwaswisu fi sudur an-nas", meaning: "celui qui souffle le mal dans le cœur des hommes" },
  { id: "nas:6", surahId: "nas", verseNum: 6, arabic: "مِنَ الْجِنَّةِ وَالنَّاسِ", translit: "Min al-jinn wa-an-nas", meaning: "parmi les djinns et les hommes" },

  // Sourate 110 : An-Nasr (3 versets)
  { id: "nasr:1", surahId: "nasr", verseNum: 1, arabic: "إِذَا جَاءَ نَصْرُ اللَّهِ وَالْفَتْحُ", translit: "Idha ja'a nasr Allah wa-al-fath", meaning: "Quand le secours d'Allah est venu avec la victoire" },
  { id: "nasr:2", surahId: "nasr", verseNum: 2, arabic: "وَرَأَيْتَ النَّاسَ يَدْخُلُونَ فِي دِينِ اللَّهِ أَفْوَاجًا", translit: "Wa-raayta an-nas yadkhulun fi din Allah afwaja", meaning: "et que tu as vu les gens entrer en masse dans la religion d'Allah" },
  { id: "nasr:3", surahId: "nasr", verseNum: 3, arabic: "فَسَبِّحْ بِحَمْدِ رَبِّكَ وَاسْتَغْفِرْهُ إِنَّهُ كَانَ تَوَّابًا", translit: "Fa-sabbih bi-hamd rabbika wa-staghfirh, innahou kana tawwab", meaning: "célèbre la louange de ton Seigneur et implore Son pardon. Il aime certes accueillir le repentir" },
];
